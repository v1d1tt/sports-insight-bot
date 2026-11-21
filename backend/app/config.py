from typing import Annotated

from fastapi import Depends
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configuration read from environment variables (names are not case-sensitive)."""

    # Default: the model picked by the model test (docs/model-eval/README.md).
    openrouter_model: str = "google/gemma-4-26b-a4b-it"


def get_settings() -> Settings:
    return Settings()


SettingsDep = Annotated[Settings, Depends(get_settings)]
