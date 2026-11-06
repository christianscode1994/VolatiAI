# Signal Valuation Architecture

## Purpose
Convert raw market data into normalized, weighted signals usable by agents.

## ValuatedSignal Fields
- value
- confidence
- volatility_score
- sentiment_score
- dev_velocity_score
- depth_stress_score

## Confidence Formula
confidence = 0.35*volatility + 0.25*sentiment + 0.25*dev_velocity + 0.15*(1-depth_stress)

## Safety
- Internal only
- Non-financial
- No user-facing values
