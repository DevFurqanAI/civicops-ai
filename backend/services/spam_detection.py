def evaluate_spam_risk(text: str) -> float:
    if len(text.strip()) < 5:
        return 0.8
    return 0.05
