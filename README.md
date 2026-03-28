# Revue Audit Énergétique

Outil de comparaison Audit / Visite Technique pour OT Énergie.

## Description

Application HTML standalone (aucun serveur requis) qui permet de :
- Charger un rapport d'audit énergétique (PDF)
- Charger un rapport de visite technique (PDF)
- Comparer automatiquement les champs via IA (OpenAI / OpenRouter)
- Générer un rapport de conformité détaillé (HTML + Excel)

## Utilisation

Ouvrir `AuditVT_Comparator.html` directement dans Chrome (protocole `file://`).

## Fonctionnalités

- Analyse IA par lots (Sonia — experte audit OT Énergie)
- Gestion des multi-instances (plusieurs parois, fenêtres, équipements)
- Rapport détaillé avec séparation par section
- Export Excel professionnel (3 onglets : Conformité, Manquants, Synthèse)
- Historique des analyses avec re-téléchargement
- Référentiel configurable (import Excel)

## Stack

HTML / CSS / JavaScript — XLSX.js — PDF.js — Lucide Icons
