"""Unit conversions for Tamil Nadu guideline rates."""

SQFT_PER_ACRE = 43560
SQFT_PER_HECTARE = 107639


def farm_per_acre(value, unit):
    """Convert an agricultural rate in rupees per acre or hectare to rupees per acre."""
    if unit == "ac":
        return value
    if unit == "ha":
        return value * SQFT_PER_ACRE / SQFT_PER_HECTARE
    raise ValueError(f"Unsupported agricultural rate unit: {unit}")
