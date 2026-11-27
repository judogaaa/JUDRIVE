import httpx

from app.schemas.diagnose import DiagnoseResponse


class MockMlResponseError(ValueError):
    """The service returned an invalid result or a result for a different check."""


class MockMlClient:
    def __init__(self, base_url: str) -> None:
        self._base_url = base_url.rstrip("/")

    async def health(self) -> bool:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{self._base_url}/health")
            return response.is_success

    async def diagnose(self, vehicle_id: str, session_id: str) -> DiagnoseResponse:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self._base_url}/diagnose",
                json={"vehicle_id": vehicle_id, "session_id": session_id},
            )
            response.raise_for_status()
            try:
                result = DiagnoseResponse.model_validate(response.json())
            except ValueError as exc:
                raise MockMlResponseError("Invalid diagnosis response") from exc
            if (result.vehicle_id, result.session_id) != (vehicle_id, session_id):
                raise MockMlResponseError("Diagnosis context mismatch")
            if result.status == "check_failed" or result.signal_quality == "bad":
                result.status = "check_failed"
                result.anomaly_type = None
                result.anomaly_title = None
                result.anomaly_score = None
                result.confidence = None
            return result


class MockToirClient:
    def __init__(self, base_url: str) -> None:
        self._base_url = base_url.rstrip("/")

    async def health(self) -> bool:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{self._base_url}/health")
            return response.is_success

    async def create_ticket(self, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{self._base_url}/tickets", json=payload)
            response.raise_for_status()
            return response.json()