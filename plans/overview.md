# Skillmon Skill Plans 2.0 — Product Requirements Document

## Overview

Skillmon Skill Plans 2.0 evolve skill plans from static checklists into
**deterministic, simulation-driven planning graphs** with support for:

- Multi-character comparison
- Attribute, remap, and accelerator simulation
- Deterministic remap optimization
- Optional skill reordering for advanced optimization
- Stable, round-trip-safe plan exports

This system is designed for **power users**, prioritizing correctness,
explainability, and offline-first operation.

---

## Core Principles

- A skill plan has **one canonical order**
- Prerequisites are always respected
- Optimization never mutates original plans
- All advanced behavior is **opt-in and previewable**
- Deterministic > heuristic > opaque

---

## Final Phase Order

Phase 0: Plan DAG & ordering
Phase 1: Multi-character comparison
Phase 2: Simulation engine
Phase 3: Attribute-only optimization
Phase 4: Skill reordering optimization
Phase 5: Undo & polish

---

## Non-Goals

- Implant optimization
- Accelerator timing optimization
- Multi-objective optimization
- Online-only workflows

---

## Summary

Skillmon Skill Plans 2.0 are:

- Deterministic
- Explainable
- More powerful than EVEMon
- Designed for expert users
- Built to grow without architectural debt
