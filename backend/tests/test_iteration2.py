"""Iteration 2 backend tests: settings endpoints and menu images support."""
import os
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Settings ----------
class TestSettings:
    def test_get_settings_shape(self, s):
        r = s.get(f"{API}/settings", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["restaurant_name", "logo_url", "gst_number", "gst_rate", "address", "phone", "printer_type"]:
            assert k in d, f"missing key {k}"
        assert isinstance(d["gst_rate"], (int, float))

    def test_put_settings_persists(self, s):
        # save originals to restore later
        original = s.get(f"{API}/settings", timeout=15).json()

        payload = {
            "restaurant_name": "TEST_Cafe",
            "gst_number": "TEST22ABCDE1234F1Z5",
            "gst_rate": 18.0,
            "address": "TEST Address 42",
            "phone": "+91 90000 00000",
            "printer_type": "thermal-80mm",
        }
        r = s.put(f"{API}/settings", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["restaurant_name"] == "TEST_Cafe"
        assert upd["gst_rate"] == 18.0
        assert upd["printer_type"] == "thermal-80mm"
        assert upd["gst_number"] == "TEST22ABCDE1234F1Z5"

        # GET to verify persistence
        g = s.get(f"{API}/settings", timeout=15).json()
        assert g["restaurant_name"] == "TEST_Cafe"
        assert g["gst_rate"] == 18.0
        assert g["address"] == "TEST Address 42"

        # partial update gst_rate
        r2 = s.put(f"{API}/settings", json={"gst_rate": 5.0}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["gst_rate"] == 5.0
        assert r2.json()["restaurant_name"] == "TEST_Cafe"  # unchanged

        # restore
        restore = {
            "restaurant_name": original.get("restaurant_name", "TableTap Restaurant"),
            "gst_number": original.get("gst_number", ""),
            "gst_rate": original.get("gst_rate", 5.0),
            "address": original.get("address", ""),
            "phone": original.get("phone", ""),
            "printer_type": original.get("printer_type", "browser"),
            "logo_url": original.get("logo_url", ""),
        }
        s.put(f"{API}/settings", json=restore, timeout=15)

    def test_put_settings_empty_body_400(self, s):
        r = s.put(f"{API}/settings", json={}, timeout=15)
        assert r.status_code == 400


# ---------- Menu with images / optional category & emoji ----------
class TestMenuImages:
    def test_create_menu_without_category_emoji(self, s):
        payload = {
            "name": "TEST_NoCatNoEmoji",
            "price": 150.0,
            "images": ["data:image/png;base64,AAA1", "data:image/png;base64,BBB2"],
        }
        r = s.post(f"{API}/menu", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["name"] == "TEST_NoCatNoEmoji"
        assert item["price"] == 150.0
        # images persisted, image_url derived from first image
        assert item["images"] == payload["images"]
        assert item["image_url"] == payload["images"][0]
        item_id = item["id"]

        # GET via list - verify persistence
        listed = s.get(f"{API}/menu", timeout=15).json()
        match = next((i for i in listed if i["id"] == item_id), None)
        assert match is not None
        assert match["images"] == payload["images"]
        assert match["image_url"] == payload["images"][0]

        # update images via PUT
        new_imgs = ["data:image/png;base64,CCC3"]
        u = s.put(f"{API}/menu/{item_id}", json={"images": new_imgs}, timeout=15)
        assert u.status_code == 200
        upd = u.json()
        assert upd["images"] == new_imgs
        assert upd["image_url"] == new_imgs[0]

        # GET to verify update
        listed2 = s.get(f"{API}/menu", timeout=15).json()
        m2 = next((i for i in listed2 if i["id"] == item_id), None)
        assert m2["images"] == new_imgs
        assert m2["image_url"] == new_imgs[0]

        # cleanup
        s.delete(f"{API}/menu/{item_id}", timeout=15)

    def test_list_menu_legacy_items_have_images_field(self, s):
        r = s.get(f"{API}/menu", timeout=15)
        assert r.status_code == 200
        items = r.json()
        for it in items:
            assert "images" in it, f"item {it.get('name')} missing images field"
            assert isinstance(it["images"], list)
            # If legacy with image_url, images should be backfilled
            if it.get("image_url"):
                assert it["image_url"] in it["images"] or len(it["images"]) >= 1

    def test_update_menu_clear_images(self, s):
        # create with images
        c = s.post(f"{API}/menu", json={"name": "TEST_ClearImg", "price": 10.0,
                                        "images": ["data:image/png;base64,XYZ"]}, timeout=15)
        item_id = c.json()["id"]

        u = s.put(f"{API}/menu/{item_id}", json={"images": []}, timeout=15)
        assert u.status_code == 200
        assert u.json()["images"] == []
        assert u.json()["image_url"] == ""

        s.delete(f"{API}/menu/{item_id}", timeout=15)
