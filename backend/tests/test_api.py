"""HTTP-level checks: who may see what, reasons before reading, consent, and the gateway API."""
import httpx
import pytest

from app import clock, protocol, workers
from app.main import app
from app.seed import demo_band_key

pytestmark = pytest.mark.anyio


class Client:
    def __init__(self, c):
        self.c, self.tokens = c, {}

    async def as_(self, name):
        if name not in self.tokens:
            users = (await self.c.get("/api/auth/demo-users")).json()
            uid = next(u["id"] for u in users if u["name"] == name)
            self.tokens[name] = (await self.c.post("/api/auth/login", json={"user_id": uid})).json()["token"]
        return {"Authorization": f"Bearer {self.tokens[name]}"}

    async def get(self, path, who, **kw):
        return await self.c.get(path, headers=await self.as_(who), **kw)

    async def post(self, path, who, body=None):
        return await self.c.post(path, headers=await self.as_(who), json=body or {})


@pytest.fixture
async def api(fresh):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield Client(c)


async def band_press(api, band, mtype, arg=0, gw="gw-7b", counter=5000):
    epoch = protocol.epoch_of(clock.now().timestamp())
    pkt = protocol.build_packet(demo_band_key(band), counter, epoch, mtype, arg)
    return await api.c.post("/api/gw/ingest", json={"packets": [{"hex": pkt.hex(), "rssi": -50}]},
                            headers={"X-Gateway-Id": gw, "Authorization": f"Bearer demo-token-{gw}"})


async def test_config_is_v2_and_demo_users_have_no_students(api):
    cfg = (await api.c.get("/api/config")).json()
    assert cfg["version"].startswith("2")
    users = (await api.c.get("/api/auth/demo-users")).json()
    assert {u["role"] for u in users} >= {"teacher", "counsellor", "principal", "parent"} and "student" not in {u["role"] for u in users}


async def test_gateway_ingest_needs_a_valid_token_and_accepts_signal_strength(api):
    bad = await api.c.post("/api/gw/ingest", json={"packets": []}, headers={"X-Gateway-Id": "gw-7b", "Authorization": "Bearer nope"})
    assert bad.status_code == 401
    r = await band_press(api, 1001, protocol.T_TALK)
    assert r.status_code == 200 and r.json()["results"][0]["status"] == "ok"


async def test_a_reason_is_needed_before_reading_a_request_and_the_child_page(api):
    await band_press(api, 1001, protocol.T_TALK)
    q = (await api.get("/api/queue", "Ms Anjali Mehta")).json()
    case = next(c for c in q if c["kind"] == "talk")
    assert (await api.get(f"/api/cases/{case['id']}", "Ms Anjali Mehta")).status_code == 428
    assert (await api.post(f"/api/cases/{case['id']}/open", "Ms Anjali Mehta", {"reason": "x"})).status_code == 422
    assert (await api.post(f"/api/cases/{case['id']}/open", "Ms Anjali Mehta", {"reason": "Riya chose me"})).status_code == 200
    got = (await api.get(f"/api/cases/{case['id']}", "Ms Anjali Mehta")).json()
    assert got["chain_ok"] is True and got["opened_by"][0]["reason"] == "Riya chose me"
    riya = case["student"]["id"]
    assert (await api.get(f"/api/students/{riya}", "Ms Farah Khan")).status_code == 428
    assert (await api.post(f"/api/students/{riya}/open", "Ms Farah Khan", {"reason": "Feelings pattern"})).status_code == 200
    page = (await api.get(f"/api/students/{riya}", "Ms Farah Khan")).json()
    assert len(page["timeline"]) == 14 and {o["who"]["label"] for o in page["opened_by"]} >= {"Ms Mehta", "Ms Khan"}


async def test_teachers_never_see_an_individual_childs_feelings(api):
    assert (await api.get("/api/patterns", "Ms Anjali Mehta")).status_code == 403
    assert (await api.get("/api/patterns", "Ms Farah Khan")).status_code == 200
    mood = (await api.get("/api/class/" + (await api.get("/api/me", "Ms Anjali Mehta")).json()["class"]["id"] + "/mood", "Ms Anjali Mehta")).json()
    assert "Riya" not in str(mood)


async def test_feelings_timeline_respects_parent_consent(api):
    await band_press(api, 1001, protocol.T_FEELING, protocol.pack_feeling(1))
    parent_home = (await api.get("/api/parent/home", "Mrs Sunita Sharma")).json()
    assert parent_home["consent"]["feelings_to_counsellor"] is True and parent_home["band"]["worn_today"] is True
    riya = parent_home["child"]["id"]
    await api.post(f"/api/students/{riya}/open", "Ms Farah Khan", {"reason": "Check"})
    assert (await api.get(f"/api/students/{riya}", "Ms Farah Khan")).json()["timeline"] is not None
    # Riya's parent switches it off; she is also reported (5th sad day), so the counsellor still sees her
    assert (await api.post("/api/parent/consent", "Mrs Sunita Sharma", {"feelings_to_counsellor": False, "sensing": False})).json()["consent"]["sensing"] is False
    await band_press(api, 1001, protocol.T_FEELING, protocol.pack_feeling(3), counter=5001)
    await workers.run_outbox_once()
    assert (await api.get(f"/api/students/{riya}", "Ms Farah Khan")).json()["reported"] is True
    inbox = (await api.c.get("/api/demo/band-inbox?band=1001")).json()
    assert inbox["sensing"] is False


async def test_call_to_talk_over_http_stops_the_clock_and_inform_parent_is_manual(api):
    await band_press(api, 1001, protocol.T_TALK)
    case = next(c for c in (await api.get("/api/queue", "Ms Anjali Mehta")).json() if c["kind"] == "talk")
    await api.post(f"/api/cases/{case['id']}/open", "Ms Anjali Mehta", {"reason": "Riya chose me"})
    assert (await api.post(f"/api/cases/{case['id']}/call", "Ms Anjali Mehta", {"when": "dinner", "where": "room12"})).status_code == 422
    r = (await api.post(f"/api/cases/{case['id']}/call", "Ms Anjali Mehta", {"when": "lunch", "where": "room12"})).json()
    assert r["status"] == "responded" and r["message"]["text"].startswith("Ms Mehta will see you")
    assert (await api.get("/api/parent/home", "Mrs Sunita Sharma")).json()["messages"] == []      # no automatic alerts
    assert (await api.post(f"/api/students/{r['student']['id']}/inform-parent", "Ms Anjali Mehta", {"text": "hi"})).status_code == 403
    assert (await api.post(f"/api/students/{r['student']['id']}/inform-parent", "Ms Farah Khan", {"text": "We talked. All good."})).status_code == 200
    assert (await api.get("/api/parent/home", "Mrs Sunita Sharma")).json()["messages"][0]["text"] == "We talked. All good."


async def test_sos_banner_data_reaches_the_class_teacher_principal_and_counsellor(api):
    await band_press(api, 1001, protocol.T_SOS, gw="gw-stairs")
    for who in ("Ms Anjali Mehta", "Mr Suresh Iyer", "Ms Farah Khan"):
        active = (await api.get("/api/sos/active", who)).json()
        assert len(active) == 1 and active[0]["location"]["gw"] == "gw-stairs", who
    sos = (await api.get("/api/sos/active", "Ms Farah Khan")).json()[0]
    assert (await api.post(f"/api/cases/{sos['id']}/ack", "Ms Farah Khan")).status_code == 200
    assert (await api.get("/api/sos/active", "Mr Suresh Iyer")).json()[0]["going_by"]["label"] == "Ms Khan"


async def test_report_csv_and_gateway_health_over_http(api):
    csv = (await api.get("/api/reports/response.csv", "Mr Suresh Iyer")).text
    assert csv.splitlines()[0].startswith("ref,kind,route,status")
    assert (await api.get("/api/reports/response.csv", "Ms Farah Khan")).status_code == 403
    gws = (await api.get("/api/gateways", "Mr Suresh Iyer")).json()
    assert next(g for g in gws["gateways"] if g["id"] == "gw-blockb")["status"].startswith("No gateway heard since")
    assert next(b for b in gws["bands"] if b["id"] == 1005)["low_battery"] is True


async def test_model_card_is_measured_and_beats_the_baseline(api):
    card = (await api.c.get("/api/model/card")).json()
    assert card["top1"] > card["baseline_top1"] and "school" not in card
    top = (await api.c.get("/api/model/suggest?band=1001&rise=r30&move=still")).json()
    assert len(top) == 10 and abs(sum(x["p"] for x in top) - 1) < 1e-6
