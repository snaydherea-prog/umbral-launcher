# Borrador de solicitud a CurseForge — pendiente de autorización

Este texto no se ha enviado. No se han aceptado términos de CurseForge ni se ha generado una clave API.

- Aplicación: Umbral Launcher
- Repositorio: https://github.com/snaydherea-prog/umbral-launcher
- Contacto: se confirmará directamente con el administrador para el formulario de Overwolf.
- Plataforma: Windows / Electron, proyecto comunitario independiente en desarrollo.
- Usuario exacto de Discord y planes de monetización: por confirmar con el administrador; son campos obligatorios del formulario.
- Tamaño de la comunidad y previsión de uso: no se han declarado cifras.
- Formulario oficial preparado, todavía sin enviar: https://forms.monday.com/forms/dce5ccb7afda9a1c21dab1a1aa1d84eb?r=use1

## Descripción propuesta

Umbral Launcher is an independent Windows desktop project with publicly available source code, built for a Minecraft community. It imports administrator-selected CurseForge modpack exports and prepares a versioned catalog. We request review of our application and guidance on an approved integration for downloading the exact referenced mod files from their official sources.

Our proposed workflow keeps the API key only in the administrator's session. Players never receive the key. The administrator would resolve project/file IDs, check availability and third-party distribution preferences, and generate a public version manifest containing file URLs, sizes and integrity hashes. Players would download approved mod files directly from CurseForge's CDN. We would not rehost CurseForge mod binaries or construct alternative download URLs for restricted files. Community-owned configurations and other authorized overrides would be hosted separately, with attribution.

The published API terms include restrictions on saving or caching API data. Please explicitly confirm whether this proposed version-manifest workflow can be approved, or advise an alternative architecture before we enable it. The integration is disabled pending your review. We also request clarification on ongoing permission checks when an author later changes distribution preferences. Minecraft account authentication and game ownership verification are being developed separately; gameplay is not enabled in this preview.

## Fuentes para revisar antes de enviar

- Solicitud y aprobación de claves: https://support.curseforge.com/support/solutions/articles/9000208346-about-the-curseforge-api-and-how-to-apply-for-a-key
- Términos de la API: https://support.curseforge.com/support/solutions/articles/9000207405-curse-forge-3rd-party-api-terms-and-conditions
- Preferencias de distribución de autores: https://support.curseforge.com/support/solutions/articles/9000207877

La solicitud requiere autorización específica para compartir los datos y aceptar las condiciones aplicables. Cualquier requisito nuevo de pago queda fuera del alcance autorizado.
