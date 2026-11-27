def test_vehicles_endpoint(auth_client):
    client = auth_client
    response = client.get("/api/vehicles")
    assert response.status_code == 200
    vehicles = response.json()["vehicles"]
    assert len(vehicles) == 50


def test_vehicle_diagnosis_history(auth_client):
    client = auth_client
    vehicles = client.get("/api/vehicles").json()["vehicles"]
    vid = vehicles[0]["vehicle_id"]
    response = client.get(f"/api/vehicles/{vid}/diagnosis-history")
    assert response.status_code == 200
    body = response.json()
    assert body["vehicle_id"] == vid
    assert isinstance(body["trend_points"], list)
