"""Shared test setup: no test may reach the real injection screen (the network)."""

from collections.abc import Iterator

import pytest

from app.main import app, get_injection_screen
from tests.fake_screen import FakeScreen


@pytest.fixture(autouse=True)
def screen() -> Iterator[FakeScreen]:
    """A screen that lets everything through. Tests change its verdict."""
    fake = FakeScreen()
    app.dependency_overrides[get_injection_screen] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_injection_screen, None)
