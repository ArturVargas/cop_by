---
name: COP By Stellar
description: Sistema visual actual de la wallet Stellar.
colors:
  brand: "#0E7C4F"
  brand-hover: "#0A5F3C"
  ink: "#17211B"
  muted: "#66736B"
  purple: "#6D45B8"
  purple-hover: "#56359A"
  border: "#DDE4DC"
  surface: "#F7F8F5"
  card: "#FFFFFF"
  on-brand: "#FFFFFF"
  positive-soft: "#E6F4EE"
  positive-border: "#D5EADF"
  negative: "#9B1C1C"
  negative-soft: "#FDECEE"
  negative-border: "#F5C6CB"
  warning: "#F2C94C"
  warning-soft: "#FFF6D8"
typography:
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
  metadata:
    fontSize: "12px"
  label:
    fontSize: "14px"
  title:
    fontSize: "24px"
    fontWeight: 700
rounded:
  control: "8px"
  receipt: "12px"
spacing:
  compact: "8px"
  content: "16px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.control}"
    height: "44px"
---

## Overview
Wallet de operación, en español. Conservar la identidad actual: superficies claras, texto oscuro, acciones verdes y comprobantes morados. Este documento registra decisiones existentes; no propone otra identidad.

## Colors
Los valores normativos están en el frontmatter. La implementación está en `apps/web/src/app/globals.css` (`--wallet-*`) y Tailwind los expone como `wallet-*`. Verde identifica acciones y resultados; morado identifica compartir y comprobantes. Los errores combinan mensaje y color. Cavos necesita el valor de marca literal en su configuración externa.

## Typography
Inter en la app; system-ui en la imagen del comprobante para exportar sin depender de fuentes remotas. Inputs a 16px. Direcciones y hashes en monospace; montos conservan los siete decimales de Stellar.

## Layout
Una columna centrada, hasta 448px y 512px desde 640px. Padding de contenido 16px. Comprobante hasta 360px, siempre adaptable al ancho disponible. Onboarding modal con desplazamiento vertical en pantallas bajas.

## Elevation & Depth
Bordes suaves separan superficies. La sombra pequeña se reserva para el onboarding y el desplegable de cuenta.

## Shapes
Controles y superficies con radios de 8px; comprobante de 12px. Cápsulas para cuenta y saldo de cabecera.

## Components
Acciones táctiles de al menos 44px; foco visible con contorno de marca. Usar el componente Button existente. Menú Cuenta con estado expandido y cierre por Escape; pestañas con flechas, Home y End. Comprobante exportado con fondo blanco, direcciones y hash completos. Mantener identificable Stellar Testnet y los fondos de prueba.

## Do's and Don'ts
Usar tokens en las pantallas Stellar. No introducir colores literales para variantes de estados existentes. No confundir errores de consulta con saldo cero ni reservas reclamables con dinero recibido. No prometer pagos a pesos como disponibles mientras Gastar sea informativo.
