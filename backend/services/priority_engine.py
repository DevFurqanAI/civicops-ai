from backend.models.common import PriorityEnum

def calculate_rules_priority(reported_urgency: str, is_civic: bool) -> PriorityEnum:
    if not is_civic:
        return PriorityEnum.LOW
    urgency_lower = reported_urgency.lower()
    if urgency_lower == "critical":
        return PriorityEnum.CRITICAL
    if urgency_lower == "high":
        return PriorityEnum.HIGH
    return PriorityEnum.MEDIUM
