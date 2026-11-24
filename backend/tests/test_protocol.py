import os

from app import protocol as p

KEY = bytes(range(16))


def test_packet_is_19_bytes_and_round_trips():
    pkt = p.build_packet(KEY, 42, 1000, p.T_SOS, 0)
    assert len(pkt) == p.PACKET_LEN == 19
    assert p.open_packet(KEY, pkt, 1000) == (p.T_SOS, 0)


def test_any_flipped_bit_is_rejected():
    pkt = bytearray(p.build_packet(KEY, 42, 1000, p.T_TALK, 0))
    for i in range(len(pkt)):
        bad = bytearray(pkt)
        bad[i] ^= 0x01
        assert p.open_packet(KEY, bytes(bad), 1000) is None, f"byte {i}"


def test_wrong_key_or_epoch_is_rejected():
    pkt = p.build_packet(KEY, 7, 1000, p.T_FEELING, 2)
    assert p.open_packet(os.urandom(16), pkt, 1000) is None
    assert p.open_packet(KEY, pkt, 1001) is None


def test_rotating_id_changes_every_epoch_and_hides_the_band():
    ids = {p.rotating_id(KEY, e) for e in range(100)}
    assert len(ids) == 100
    assert p.rotating_id(KEY, 5) != p.rotating_id(os.urandom(16), 5)


def test_type_is_encrypted_on_air():
    a = p.build_packet(KEY, 9, 1000, p.T_SOS, 0)
    b = p.build_packet(KEY, 9, 1000, p.T_FEELING, 1)
    assert a[:9] == b[:9]           # same header
    assert a[9:11] != b[9:11]       # but the type bytes can't be read


def test_receipt_only_valid_with_the_band_key():
    rid = p.rotating_id(KEY, 1000)
    r = p.build_receipt(KEY, rid, 42, p.R_OK, 1000)
    assert len(r) == p.RECEIPT_LEN == 22
    assert p.verify_receipt(KEY, r, rid, 42) == p.R_OK
    assert p.verify_receipt(KEY, r, rid, 43) is None            # wrong message
    forged = p.build_receipt(os.urandom(16), rid, 42, p.R_OK, 1000)
    assert p.verify_receipt(KEY, forged, rid, 42) is None       # a gateway can't fake "sent"


def test_feeling_argument_packs_and_unpacks():
    arg = p.pack_feeling(3, rise=2, asked=True, accepted=False)
    assert p.unpack_feeling(arg) == {"code": 3, "rise": 2, "asked": True, "accepted": False}
    assert p.unpack_feeling(p.pack_feeling(10, 3, False, True)) == {"code": 10, "rise": 3, "asked": False, "accepted": True}
    pkt = p.build_packet(KEY, 5, 1000, p.T_FEELING, arg)
    assert p.open_packet(KEY, pkt, 1000) == (p.T_FEELING, arg)
