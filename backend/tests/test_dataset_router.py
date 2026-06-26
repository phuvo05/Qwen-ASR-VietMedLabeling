import json
from pathlib import Path

from backend.routers import dataset


def test_save_dataset_replaces_dataset_and_clears_review_state(client, tmp_path, monkeypatch):
    data_file = tmp_path / "default_dataset.jsonl"
    checked_file = tmp_path / "checked.json"
    edited_file = tmp_path / "edited.json"
    checked_file.write_text(json.dumps({"old.wav": {"checked_at": "x", "original_transcript": "old"}}), encoding="utf-8")
    edited_file.write_text(json.dumps({"old.wav": "edited old"}), encoding="utf-8")

    monkeypatch.setattr(dataset, "_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(dataset, "_DATA_FILE", str(data_file))
    monkeypatch.setattr(dataset, "_CHECK_FILE", str(checked_file))
    monkeypatch.setattr(dataset, "_EDITED_FILE", str(edited_file))

    response = client.post("/api/dataset", json={"content": "{\"id\": \"new.wav\"}\n"})

    assert response.status_code == 200
    assert data_file.read_text(encoding="utf-8") == "{\"id\": \"new.wav\"}\n"
    assert json.loads(checked_file.read_text(encoding="utf-8")) == {}
    assert json.loads(edited_file.read_text(encoding="utf-8")) == {}


def test_get_dataset_disables_cache(client, tmp_path, monkeypatch):
    data_file = tmp_path / "default_dataset.jsonl"
    data_file.write_text("{\"id\": \"new.wav\"}\n", encoding="utf-8")

    monkeypatch.setattr(dataset, "_DATA_FILE", str(data_file))

    response = client.get("/api/dataset")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
