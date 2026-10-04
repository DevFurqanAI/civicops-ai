import logging

logger = logging.getLogger("civicops.audit")

def log_audit_event(event_name: str, details: dict):
    logger.info(f"AUDIT: {event_name} -> {details}")
