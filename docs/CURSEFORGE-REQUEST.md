# Solicitud a CurseForge enviada — pendiente de revisión

La solicitud de Umbral Launcher se envió el 24 de noviembre de 2026 mediante el formulario oficial de Overwolf. Se observó la pantalla de confirmación «Thank you!». Los términos se aceptaron con autorización expresa del administrador. Esto confirma el envío, no la aprobación de acceso: todavía no se ha recibido una clave API.

- Aplicación: Umbral Launcher
- Repositorio: https://github.com/snaydherea-prog/umbral-launcher
- Datos de contacto: proporcionados directamente en el formulario y omitidos de este documento público.
- Plataforma: Windows / Electron, proyecto comunitario independiente en desarrollo.
- Monetización: proyecto gratuito, sin anuncios, suscripciones ni donaciones, según lo confirmado por el administrador.
- Tamaño de la comunidad y previsión de uso: no se han declarado cifras.
- Formulario oficial utilizado: https://forms.monday.com/forms/dce5ccb7afda9a1c21dab1a1aa1d84eb?r=use1

## Resumen técnico de la solicitud

Umbral Launcher is an independent Windows desktop project with publicly available source code, built for a Minecraft community. It imports administrator-selected CurseForge modpack exports and prepares a versioned catalog. We request review of our application and guidance on an approved integration for downloading the exact referenced mod files from their official sources.

Our proposed workflow keeps the API key only in the administrator's session. Players never receive the key. The administrator would resolve project/file IDs, check availability and third-party distribution preferences, and generate a public version manifest containing file URLs, sizes and integrity hashes. Players would download approved mod files directly from CurseForge's CDN. We would not rehost CurseForge mod binaries or construct alternative download URLs for restricted files. Community-owned configurations and other authorized overrides would be hosted separately, with attribution.

The published API terms include restrictions on saving or caching API data. Please explicitly confirm whether this proposed version-manifest workflow can be approved, or advise an alternative architecture before we enable it. The integration is disabled pending your review. We also request clarification on ongoing permission checks when an author later changes distribution preferences. Minecraft account authentication and game ownership verification are being developed separately; gameplay is not enabled in this preview.

## Fuentes para revisar antes de enviar

- Solicitud y aprobación de claves: https://support.curseforge.com/support/solutions/articles/9000208346-about-the-curseforge-api-and-how-to-apply-for-a-key
- Términos de la API: https://support.curseforge.com/support/solutions/articles/9000207405-curse-forge-3rd-party-api-terms-and-conditions
- Preferencias de distribución de autores: https://support.curseforge.com/support/solutions/articles/9000207877

La solicitud indica reducir o detener el uso si supera los límites gratuitos antes de contratar servicios de pago. No se ha contratado ningún plan ni comprometido pagos. La integración seguirá desactivada hasta recibir la aprobación y aclaración del método de distribución por parte de Overwolf.
