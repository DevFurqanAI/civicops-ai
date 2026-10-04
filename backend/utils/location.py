def validate_coordinates(lat: float, lon: float) -> bool:
    if lat is None or lon is None:
        return True
    return -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0
