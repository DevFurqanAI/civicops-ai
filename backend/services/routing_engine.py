from backend.models.common import DepartmentEnum, CategoryEnum

def route_to_department(category: CategoryEnum) -> DepartmentEnum:
    mapping = {
        CategoryEnum.SEWERAGE_DRAINAGE: DepartmentEnum.WATER_SANITATION,
        CategoryEnum.WASTE_SANITATION: DepartmentEnum.WASTE_MANAGEMENT,
        CategoryEnum.WATER_SUPPLY: DepartmentEnum.WATER_SANITATION,
        CategoryEnum.ELECTRICITY: DepartmentEnum.ELECTRICITY_UTILITY,
        CategoryEnum.STREET_LIGHTING: DepartmentEnum.PUBLIC_LIGHTING,
        CategoryEnum.ROAD_DAMAGE: DepartmentEnum.ROAD_MAINTENANCE,
        CategoryEnum.GAS_UTILITIES: DepartmentEnum.GAS_UTILITY,
        CategoryEnum.PARKS_HORTICULTURE: DepartmentEnum.PARKS_HORTICULTURE,
        CategoryEnum.STRAY_ANIMALS_SAFETY: DepartmentEnum.ANIMAL_CONTROL,
    }
    return mapping.get(category, DepartmentEnum.MANUAL_REVIEW)
