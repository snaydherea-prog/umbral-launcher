# Umbral Launcher — 1.0.0-preview.4

Aplicación **Electron para Windows** de la comunidad Umbral. Diseño oscuro inspirado en el mockup proporcionado por el administrador, con biblioteca, Discord, perfil, estadísticas y sincronización de archivos.

**Estado:** vista previa de desarrollo. **No es todavía un launcher capaz de instalar o ejecutar Minecraft.** JUGAR indica esta limitación de forma explícita. Se necesita integrar y probar el motor Java, los cargadores de mods y la autenticación oficial antes de compartirlo como launcher jugable.

## Instalador de Windows

GitHub Actions compila un instalador NSIS (`Umbral-Launcher-Setup-…exe`) y un ejecutable portátil (`Umbral-Launcher-Portable-…exe`) con nombres distintos. Abre la pestaña **Actions**, elige la ejecución verde más reciente y descarga el artefacto `Umbral-Launcher-Windows`. No necesitas Node.js en las computadoras de tus miembros. La compilación comprueba que ambos ejecutables existen y que el Client ID está incluido en la aplicación empaquetada.

## Administración de modpacks

La versión preview.4 añade **Ajustes → Administrar Umbral**. Puedes importar un ZIP de CurseForge, revisar su versión de Minecraft y cargador, y guardar borradores. También admite carpetas de modpacks cuyos archivos tengas permiso de distribuir.

Para publicar se verifica la cuenta GitHub **snaydherea-prog** (ID 322669037) y su permiso de escritura en este repositorio. El administrador conecta un token limitado a este repositorio con **Contents: lectura y escritura**. El token se mantiene solo durante la sesión, no se guarda ni se incluye en los instaladores. No pegues tokens en chats o archivos del proyecto.

La publicación prepara paquetes de archivos por carpeta, los sube a una release en borrador, verifica las cargas y actualiza el catálogo al final. Los jugadores solo leen el catálogo y descargan. Las actualizaciones comprueban hashes antes de cambiar la instalación, conservan options.txt y guardan copias de los archivos sustituidos o retirados. Los mundos, capturas y datos de cuenta no se gestionan como archivos de modpack.

**KEO RPG Optimized:** el ZIP revisado usa Minecraft 1.21.1, NeoForge 21.1.248 y Java 21. Su lista contiene 273 mods, 13 paquetes de recursos y 9 shaders referenciados en CurseForge. La página llama a la descarga 7.0.1; el manifest.json interno indica 7.0.0. Se conserva esa diferencia en la ficha de origen. La importación prepara 9.260 archivos y mantiene las 295 referencias externas pendientes: el ZIP no contiene esos mods como archivos JAR.

**La integración de descargas de CurseForge sigue desactivada.** Necesitamos aprobación para Umbral y confirmar con Overwolf el método de distribución y almacenamiento de metadatos. La clave API no debe compartirse con jugadores. Un borrador con referencias pendientes no se puede publicar. Tener un ZIP exportado no prueba que todas sus dependencias admitan descarga por otros launchers.

Consulta [la guía de administración](docs/ADMINISTRACION.md) y [la solicitud enviada a CurseForge](docs/CURSEFORGE-REQUEST.md). El catálogo mantiene KEO sin publicar hasta completar las descargas y las pruebas.

## Cuentas y perfiles

- **Microsoft:** OAuth 2.0 PKCE con navegador del sistema. Necesita una aplicación Microsoft Entra configurada y autorización para Minecraft Services. Hasta entonces puede fallar; no está probada de extremo a extremo. La skin y el nombre se muestran solo si Minecraft devuelve un perfil válido.
- **Perfil local:** permite configurar un nombre de 3 a 16 caracteres para la interfaz, pero **no verifica propiedad de Minecraft ni habilita la ejecución**. No se etiqueta como cuenta prémium.
- **Horas jugadas:** aparecen como `—` hasta que se implemente el registro de sesiones de juego; no se inventan estadísticas.
- **RAM:** se guarda por modpack (2 a 16 GB); todavía falta conectarla al proceso de Minecraft cuando se integre el motor Java.
- **Discord:** [Invitación Umbral](https://discord.gg/PFMEcJ3Hq4).

## Configuración del inicio de sesión Microsoft

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
