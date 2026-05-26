"""Pytest configuration — register custom markers used across test suites."""

import pytest


def pytest_configure(config):
    config.addinivalue_line("markers", "slow: tests that require model loading or heavy computation")
