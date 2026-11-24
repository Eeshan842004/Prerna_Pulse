"""The band's radio protocol.

A band message is 19 bytes, small enough for one Bluetooth LE advertisement:

    ver(1) | rid(4) | counter(4) | ciphertext(2) | tag(8)

* rid      rotating ID = HMAC-SHA256(band_key, "rid" || epoch)[:4]; changes every 15 minutes,
           so a gateway cannot follow one band around the school.
* counter  only goes up; the server rejects old values (replay protection).
* ciphertext + tag
           AES-CCM over (type, arg) with an 8-byte tag. Nonce = rid | counter | epoch | ver (13 bytes).
           The header bytes are authenticated as associated data.

A receipt is 22 bytes:

    'R'(1) | rid(4) | counter(4) | status(1) | server_epoch(4) | tag(8)

tag = HMAC-SHA256(band_key, "rcpt" || first 14 bytes)[:8]. Only the server holds band keys,
so a gateway can relay a receipt but can never forge one. The band buzzes once only for a
receipt whose tag checks out.
"""
from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESCCM

VERSION = 1
EPOCH_SECONDS = 900
PACKET_LEN = 19
RECEIPT_LEN = 22

# Message types (v2, band-only). The 19-byte envelope is unchanged; only the meaning of type+arg is new.
T_FEELING = 1     # arg: bits 0-3 feeling code (1 fine .. 10 just active), bits 4-5 heart-rate rise bucket,
                  #      bit 6 the band asked, bit 7 the child accepted the star suggestion
T_SKIPPED = 2     # a band question went unanswered
T_TALK = 3        # arg: 0 = my adult, 1 = counsellor
T_SOS = 4         # arg: 0 = danger, 1 = medical (the child chose Unwell + nurse)
T_CANCEL = 5      # cancel an SOS within 60 seconds
T_STATUS = 6      # "anything waiting for me?"; during an SOS it doubles as the location beacon
T_BATTERY = 7     # arg: battery percent
T_PAUSE = 8       # PT mode: arg = minutes (0 = off)
T_SEEN = 9        # the child pressed Okay on a message: arg = low byte of the message id
T_EXERCISE = 10   # arg: 1 felt better, 2 wants to talk
T_SUGGESTION = 11  # arg: bit 0 accepted the star, bits 1-2 movement, bits 3-6 the suggested feeling

TYPE_NAMES = {T_FEELING: "feeling", T_SKIPPED: "skipped", T_TALK: "talk", T_SOS: "sos", T_CANCEL: "cancel",
              T_STATUS: "status", T_BATTERY: "battery", T_PAUSE: "pause", T_SEEN: "seen", T_EXERCISE: "exercise",
              T_SUGGESTION: "suggestion"}


def pack_feeling(code: int, rise: int = 0, asked: bool = False, accepted: bool = False) -> int:
    return (code & 15) | ((rise & 3) << 4) | (64 if asked else 0) | (128 if accepted else 0)


def unpack_feeling(arg: int) -> dict:
    return {"code": arg & 15, "rise": (arg >> 4) & 3, "asked": bool(arg & 64), "accepted": bool(arg & 128)}


R_OK = 0
R_DUPLICATE = 1
R_REPLY_WAITING = 2


def epoch_of(unix_seconds: float) -> int:
    return int(unix_seconds // EPOCH_SECONDS)


def rotating_id(key: bytes, epoch: int) -> bytes:
    return hmac.new(key, b"rid" + epoch.to_bytes(4, "big"), hashlib.sha256).digest()[:4]


def _nonce(rid: bytes, counter: int, epoch: int) -> bytes:
    return rid + counter.to_bytes(4, "big") + epoch.to_bytes(4, "big") + bytes([VERSION])


def build_packet(key: bytes, counter: int, epoch: int, msg_type: int, arg: int) -> bytes:
    """What the band firmware sends (also used by the simulators and tests)."""
    rid = rotating_id(key, epoch)
    header = bytes([VERSION]) + rid + counter.to_bytes(4, "big")
    sealed = AESCCM(key, tag_length=8).encrypt(_nonce(rid, counter, epoch), bytes([msg_type, arg]), header)
    return header + sealed


@dataclass
class Header:
    version: int
    rid: bytes
    counter: int


def parse_header(packet: bytes) -> Header:
    if len(packet) != PACKET_LEN:
        raise ValueError(f"packet must be {PACKET_LEN} bytes, got {len(packet)}")
    return Header(packet[0], packet[1:5], int.from_bytes(packet[5:9], "big"))


def open_packet(key: bytes, packet: bytes, epoch: int) -> tuple[int, int] | None:
    """Return (type, arg) if the packet is authentic for this key and epoch, else None."""
    h = parse_header(packet)
    if h.version != VERSION or h.rid != rotating_id(key, epoch):
        return None
    try:
        plain = AESCCM(key, tag_length=8).decrypt(_nonce(h.rid, h.counter, epoch), packet[9:], packet[:9])
    except Exception:
        return None
    return plain[0], plain[1]


def build_receipt(key: bytes, rid: bytes, counter: int, status: int, server_epoch: int) -> bytes:
    body = b"R" + rid + counter.to_bytes(4, "big") + bytes([status]) + server_epoch.to_bytes(4, "big")
    return body + hmac.new(key, b"rcpt" + body, hashlib.sha256).digest()[:8]


def verify_receipt(key: bytes, receipt: bytes, rid: bytes, counter: int) -> int | None:
    """What the band does with a receipt it hears. Returns the status byte, or None if fake."""
    if len(receipt) != RECEIPT_LEN or receipt[:1] != b"R":
        return None
    body, tag = receipt[:14], receipt[14:]
    if not hmac.compare_digest(tag, hmac.new(key, b"rcpt" + body, hashlib.sha256).digest()[:8]):
        return None
    if body[1:5] != rid or int.from_bytes(body[5:9], "big") != counter:
        return None
    return body[9]
