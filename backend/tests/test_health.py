from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_ok_and_the_model_from_the_environment(monkeypatch):
    monkeypatch.setenv("OPENROUTER_MODEL", "google/gemma-4-26b-a4b-it:free")

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "model": "google/gemma-4-26b-a4b-it:free",
    }


def test_health_falls_back_to_the_model_chosen_in_the_model_test(monkeypatch):
    monkeypatch.delenv("OPENROUTER_MODEL", raising=False)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["model"] == "google/gemma-4-26b-a4b-it"
