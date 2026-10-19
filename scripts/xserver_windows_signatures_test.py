import unittest
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

import xserver_windows_signatures as signatures
from xserver_source_review import ReviewError
from xserver_windows_signatures import certificate_keys, signature_status


PRIMARY = "A" * 40
SIGNER = "B" * 40
OLD = "C" * 40
CERTIFICATE = {"primaryFingerprint": PRIMARY, "primaryBits": 4096, "primaryAlgorithm": 1}
SIGNING = {"fingerprint": SIGNER, "epoch": 100, "algorithm": 22, "digest": 10}
METADATA = (f"pub:-:4096:1:id:1:300:::::sc:\nfpr:::::::::{PRIMARY}:\n"
            f"sub:-:255:22:id:1:250:::::s:\nfpr:::::::::{SIGNER}:\n"
            f"sub:e:255:22:id:1:50:::::s:\nfpr:::::::::{OLD}:\n")
STATUS = (f"[GNUPG:] NEWSIG\n[GNUPG:] GOODSIG {SIGNER[-16:]} fixture\n"
          f"[GNUPG:] VALIDSIG {SIGNER} 1970-01-01 100 0 4 0 22 10 00 {PRIMARY}\n")


class DependencySignatureTests(unittest.TestCase):
    def assertCode(self, code, operation, *arguments):
        with self.assertRaises(ReviewError) as caught:
            operation(*arguments)
        self.assertEqual(str(caught.exception), code)

    def keys(self, metadata=METADATA, now=200):
        return certificate_keys(metadata, CERTIFICATE, SIGNING, now)

    def test_primary_and_signing_subkey_are_verified_separately(self):
        result = signature_status(STATUS, CERTIFICATE, SIGNING, self.keys())
        self.assertEqual(result["fingerprint"], SIGNER)
        self.assertEqual(result["primaryFingerprint"], PRIMARY)
        self.assertFalse(result["distributionApproved"])

    def test_expired_or_revoked_actual_key_is_rejected(self):
        for changed in [METADATA.replace("pub:-", "pub:r"), METADATA.replace("sub:-", "sub:e"),
                        METADATA.replace(":250:", ":150:")]:
            with self.subTest(changed=changed):
                self.assertCode("DEPENDENCY_KEY_LIFETIME", self.keys, changed)
        self.assertCode("DEPENDENCY_KEY_LIFETIME", self.keys, METADATA, 301)

    def test_only_expiry_note_bound_to_unrelated_certificate_key_is_accepted(self):
        keys = self.keys()
        result = signature_status("[GNUPG:] KEYEXPIRED 50\n" + STATUS, CERTIFICATE, SIGNING, keys)
        self.assertEqual(result["unrelatedExpiredKeyNotes"], [50])
        for epoch in ["250", "300", "42"]:
            self.assertCode("DEPENDENCY_EXPIRED_KEY", signature_status,
                            "[GNUPG:] KEYEXPIRED " + epoch + "\n" + STATUS, CERTIFICATE, SIGNING, keys)

    def test_wrong_primary_signer_epoch_and_algorithm_are_rejected(self):
        for changed, code in [(STATUS.replace(PRIMARY, OLD), "DEPENDENCY_SIGNATURE_SIGNER"),
                              (STATUS.replace(SIGNER, OLD), "DEPENDENCY_SIGNATURE_SIGNER"),
                              (STATUS.replace("100 0 4", "101 0 4"), "DEPENDENCY_SIGNATURE_TIME"),
                              (STATUS.replace("22 10 00", "22 2 00"), "DEPENDENCY_SIGNATURE_ALGORITHM")]:
            with self.subTest(code=code):
                self.assertCode(code, signature_status, changed, CERTIFICATE, SIGNING, self.keys())

    def test_duplicate_signature_and_unknown_or_error_status_cannot_pass(self):
        self.assertCode("DEPENDENCY_SIGNATURE_COUNT", signature_status, STATUS + STATUS, CERTIFICATE, SIGNING, self.keys())
        for status in ["EXPKEYSIG", "REVKEYSIG", "BADSIG", "ERRSIG", "UNEXPECTED"]:
            self.assertCode("DEPENDENCY_SIGNATURE_STATUS", signature_status,
                            "[GNUPG:] " + status + "\n" + STATUS, CERTIFICATE, SIGNING, self.keys())

    def test_rejected_status_diagnostics_contain_only_status_names(self):
        with self.assertRaises(signatures.SignatureStatusError) as caught:
            signature_status("[GNUPG:] UNEXPECTED arbitrary payload\n" + STATUS, CERTIFICATE, SIGNING, self.keys())
        self.assertEqual(caught.exception.status_kinds, ["GOODSIG", "NEWSIG", "UNEXPECTED", "VALIDSIG"])
        self.assertNotIn("payload", str(caught.exception))

    def test_failed_collection_overwrites_old_success_and_exits_nonzero(self):
        with tempfile.TemporaryDirectory() as temporary:
            report = Path(temporary) / "report.json"
            report.write_text('{"dependencySignaturesVerified":true}')
            with patch.object(signatures, "collect_dependencies", side_effect=ReviewError("INPUT_SHA256")):
                self.assertEqual(signatures.main(["--cache", temporary, "--report", str(report)]), 1)
            result = json.loads(report.read_text())
            self.assertFalse(result["dependencySignaturesVerified"])
            self.assertEqual(result["error"], "INPUT_SHA256")


if __name__ == "__main__":
    unittest.main()
