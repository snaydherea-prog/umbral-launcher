# Umbral Launcher — 1.0.0-preview.3

Aplicación **Electron para Windows** de la comunidad Umbral. Diseño oscuro inspirado en el mockup proporcionado por el administrador, con biblioteca, Discord, perfil, estadísticas y sincronización de archivos.

**Estado:** vista previa de desarrollo. **No es todavía un launcher capaz de instalar o ejecutar Minecraft.** JUGAR indica esta limitación de forma explícita. Se necesita integrar y probar el motor Java, los cargadores de mods y la autenticación oficial antes de compartirlo como launcher jugable.

## Instalador de Windows

GitHub Actions compila un instalador NSIS (`Umbral-Launcher-Setup-…exe`) y un ejecutable portátil (`Umbral-Launcher-Portable-…exe`) con nombres distintos. Abre la pestaña **Actions**, elige la ejecución verde más reciente y descarga el artefacto `Umbral-Launcher-Windows`. No necesitas Node.js en las computadoras de tus miembros. La compilación comprueba que ambos ejecutables existen y que el Client ID está incluido en la aplicación empaquetada.

## Catálogo administrado (solo administrador)

El catálogo público está en [catalog/modpacks.json](catalog/modpacks.json). **Los miembros no pueden publicar modpacks desde el launcher.** Solo los colaboradores con permisos de escritura en GitHub pueden modificar ese archivo.

Para publicar:

1. Prepara un modpack compatible con Minecraft y su cargador (Forge/Fabric/NeoForge/Quilt).
2. Hospeda los archivos autorizados en enlaces HTTPS con descargas directas.
3. En una computadora de administración, ejecuta `node tools/generar-manifiesto.mjs "C:\\ruta\\modpack" "https://ejemplo.com/archivos" "1.0.0"` para generar `manifest.json`. Se incluyen `mods`, `config`, `defaultconfigs`, `resourcepacks`, `shaderpacks` y `kubejs`.
4. Sube el manifiesto a un lugar público HTTPS y comprueba que cada URL de archivo coincide con el archivo real.
5. Edita `catalog/modpacks.json`: completa `manifestUrl`, `minecraftVersion`, `loader`, `loaderVersion`, `version` y establece `published: true`.
6. Los usuarios abren el launcher y seleccionan **DESCARGAR / ACTUALIZAR**. El sistema verifica hashes SHA-256. Los archivos obsoletos gestionados por Umbral se retiran si no han sido modificados. Nunca se deben incluir mundos, datos de cuenta ni archivos personales en el manifiesto.

No redistribuyas mods ni archivos de Minecraft sin verificar los permisos de sus autores. Las referencias a archivos de Minecraft deben obtenerse de fuentes autorizadas.

## Cuentas y perfiles

- **Microsoft:** OAuth 2.0 PKCE con navegador del sistema. Necesita una aplicación Microsoft Entra configurada y autorización para Minecraft Services. Hasta entonces puede fallar; no está probada de extremo a extremo. La skin y el nombre se muestran solo si Minecraft devuelve un perfil válido.
- **Perfil local:** permite configurar un nombre de 3 a 16 caracteres para la interfaz, pero **no verifica propiedad de Minecraft ni habilita la ejecución**. No se etiqueta como cuenta prémium.
- **Horas jugadas:** aparecen como `—` hasta que se implemente el registro de sesiones de juego; no se inventan estadísticas.
- **RAM:** se guarda por modpack (2 a 16 GB); todavía falta conectarla al proceso de Minecraft cuando se integre el motor Java.
- **Discord:** [Invitación Umbral](https://discord.gg/PFMEcJ3Hq4).

## Inicio de sesión Microsoft para la administración

Umbral Launcher está registrada como cliente público para cuentas personales de Microsoft, con URI `http://localhost`. Su Client ID público es `3edb800a-c582-4709-ab16-3536aa83563b` y está incluido en `src/microsoft-app.json`; no es un secreto. La autorización de Minecraft Services y la prueba de inicio de sesión con una cuenta real siguen pendientes.

La compilación usa ese archivo de configuración. Opcionalmente, la variable de repositorio `UMBRAL_MICROSOFT_CLIENT_ID` en **Settings → Secrets and variables → Actions → Variables** permite sustituirlo. Una variable ausente no borra el ID del proyecto y un ID inválido detiene la compilación. Los miembros no necesitan configurar el ID.

No se deben subir tokens, contraseñas ni secretos al repositorio. Si Microsoft no autoriza la aplicación, no existe un modo legítimo de saltar esa autorización.

## Trabajo pendiente antes de publicar una versión final

- Integrar y probar Java Runtime, instalación de Minecraft y cargadores Forge/Fabric/NeoForge/Quilt.
- Probar autenticación de Minecraft Services y renovación de tokens.
- Conectar **JUGAR** con ejecución real, verificación de archivos y la RAM elegida.
- Medir horas desde procesos reales de juego, y mostrar conteo de mods procedente del manifiesto.
- Sustituir el fondo provisional por recursos de alta calidad autorizados y validar el diseño en diferentes resoluciones.
- Probar en Windows 10/11, instalador, antivirus/SmartScreen y sincronización real de un modpack.

Este proyecto no es un producto oficial de Minecraft ni está afiliado con Mojang o Microsoft.
