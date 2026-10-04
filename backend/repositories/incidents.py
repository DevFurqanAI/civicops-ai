"""Persistent incidents and links. All writes use JSON-safe database columns."""
import json
import logging
from uuid import UUID, NAMESPACE_URL, uuid5

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from postgrest.exceptions import APIError

logger = logging.getLogger("civicops.database")


def stable_id(kind, identity):
    return str(uuid5(NAMESPACE_URL, f"civicops:{kind}:{identity}"))


class IncidentsRepository:
    def __init__(self, client):
        self.client = client

    def execute(self, query, operation):
        try:
            return query.execute().data
        except Exception as error:
            # Never log raw DB errors: details may contain a complete report row.
            code = error.code if isinstance(error, APIError) else None
            if not isinstance(code, str) or not code.isalnum() or len(code) > 12:
                code = None
            logger.warning("Incident storage failure: %s", json.dumps({
                "operation": operation, "exception_class": type(error).__name__, "error_code": code}))
            raise HTTPException(503, "Incident storage unavailable") from None

    def rows(self, table, filters=()):
        result = []
        while True:
            query = self.client.table(table).select("*")
            for method, field, value in filters:
                query = getattr(query, method)(field, value)
            # Stable pagination avoids the Data API's default row limit.
            batch = self.execute(query.order("id").range(len(result), len(result) + 499), f"{table}.select")
            result.extend(batch)
            if len(batch) < 500:
                return result

    def find(self, table, field, value):
        rows = self.execute(self.client.table(table).select("*").eq(field, value).limit(1), f"{table}.select")
        return rows[0] if rows else None

    def resolve(self, identity):
        try:
            UUID(identity)
            return self.find("incidents", "id", identity)
        except ValueError:
            incident = self.find("incidents", "incident_code", identity)
            if incident:
                return incident
            # Old clients used the report public ID as incident_id.
            report = self.find("reports", "public_id", identity)
            link = self.link_for_report(report["id"]) if report else None
            return self.find("incidents", "id", link["incident_id"]) if link else None

    def link_for_report(self, report_id):
        return self.find("incident_reports", "report_id", report_id)

    def linked_reports(self, incident_id):
        links = self.rows("incident_reports", (("eq", "incident_id", incident_id),))
        reports = []
        for start in range(0, len(links), 100):
            ids = [link["report_id"] for link in links[start:start + 100]]
            reports.extend(self.rows("reports", (("in_", "id", ids),)))
        return sorted(reports, key=lambda r: (r["created_at"], r["id"]))

    def insert_once(self, table, row, lookup_field="id"):
        row = jsonable_encoder(row)
        try:
            rows = self.client.table(table).insert(row).execute().data
            if not rows:
                raise HTTPException(503, "Incident storage unavailable")
            return rows[0]
        except APIError as error:
            if error.code == "23505":
                winner = self.find(table, lookup_field, row[lookup_field])
                if winner:
                    return winner
            logger.warning("Incident storage failure: %s", json.dumps({
                "operation": f"{table}.insert", "exception_class": type(error).__name__,
                "error_code": error.code if isinstance(error.code, str) and error.code.isalnum() else None}))
            raise HTTPException(503, "Incident storage unavailable") from None
        except HTTPException:
            raise
        except Exception as error:
            logger.warning("Incident storage failure: %s", json.dumps({
                "operation": f"{table}.insert", "exception_class": type(error).__name__, "error_code": None}))
            raise HTTPException(503, "Incident storage unavailable") from None

    def candidates(self, category, since, until):
        return self.rows("incidents", (("eq", "category", category), ("is_", "archived_at", "null"),
            ("in_", "status", ["RECEIVED", "VERIFIED", "ASSIGNED", "IN_PROGRESS", "REOPENED", "NEEDS_REVIEW"]),
            ("gte", "created_at", since), ("lte", "created_at", until)))

    def department(self, key):
        department = self.find("departments", "department_key", key)
        if not department or not department["is_active"]:
            raise HTTPException(503, "Routed department unavailable")
        return department

    def update_incident(self, incident, values):
        # Compare-and-swap prevents concurrent aggregate writes overwriting each other.
        return self.execute(self.client.table("incidents").update(jsonable_encoder(values))
            .eq("id", incident["id"]).eq("updated_at", incident["updated_at"]), "incidents.update")

    def mark_linked(self, report_id):
        self.execute(self.client.table("reports").update({"processing_status": "LINKED"})
                     .eq("id", report_id), "reports.update")

    def rpc(self, name, parameters):
        try:
            result = self.client.rpc(name, jsonable_encoder(parameters)).execute().data
            if not isinstance(result, dict):
                raise ValueError("Invalid RPC result")
            return result
        except APIError as error:
            messages = {"PT403": (403, "This action is not permitted"),
                "PT404": (404, "Incident not found"), "PT409": (409, "Action conflicts with the current incident; refresh before retrying"),
                "PT422": (422, "Invalid operational action"), "23505": (409, "Feedback already submitted")}
            if error.code in messages:
                status, message = messages[error.code]
                raise HTTPException(status, message) from None
            logger.warning("Operational storage failure: %s", json.dumps({"operation": name,
                "exception_class": type(error).__name__, "error_code": error.code if isinstance(error.code, str) and error.code.isalnum() else None}))
            raise HTTPException(503, "Operational storage unavailable") from None
        except Exception:
            raise HTTPException(503, "Operational storage unavailable") from None
