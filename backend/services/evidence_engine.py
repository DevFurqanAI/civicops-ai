def calculate_evidence_confidence(has_image: bool, has_location: bool) -> float:
    score = 0.6
    if has_location:
        score += 0.2
    if has_image:
        score += 0.2
    return min(score, 1.0)
