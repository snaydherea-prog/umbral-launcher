# Umbral Launcher v0.7.0

Aplicación de escritorio Windows para la comunidad **Umbral**, construida con Electron.

## Estado actual

- Aplicación Windows con interfaz propia, temática oscura y secciones Inicio / Biblioteca / Modpacks / Ajustes.
- Múltiples modpacks, configuraciones separadas y carpetas por instancia.
- Sincronización desde un manifiesto HTTPS y verificación SHA-256.
- Compilación de instalador NSIS y versión portable mediante GitHub Actions.

**Esta versión es un prototipo funcional de interfaz y sincronización, no un launcher jugable aún.** El botón JUGAR muestra un aviso. Todavía faltan y deben validarse la autenticación Microsoft/Minecraft, instalación de Java, descarga del juego y configuración e inicio reales de Forge/Fabric/NeoForge. No compartas esta edición como launcher terminado.

## Compilar ejecutables sin Node.js en tu PC

1. Abre [Actions](https://github.com/snaydherea-prog/umbral-launcher/actions).
2. Selecciona **Compilar Umbral Launcher para Windows**.
3. Si no se ha ejecutado por el último push, pulsa **Run workflow** y selecciona **main**.
4. Espera el resultado de GitHub; si la ejecución termina en verde, abre el run.
5. Abajo, en **Artifacts**, descarga **Umbral-Launcher-Windows**, descomprime el ZIP y ejecuta el archivo de instalación .exe. GitHub Actions puede requerir habilitar workflows para repositorios recién creados.

Si hay una X roja, revisa los logs de la ejecución; el instalador no se considera generado hasta que aparezca el artefacto.

## Ejecutar en desarrollo

```powershell
npm install
npm start
```

## Formato de manifiesto HTTPS

```json
{
  "version": "1.0.0",
  "files": [
    {
      "path": "mods/ejemplo.jar",
      "url": "https://servidor.example/mods/ejemplo.jar",
      "sha256": "64 caracteres hexadecimales del hash SHA-256"
    }
  ]
}
```

El SHA-256 debe corresponder al contenido real descargado. Cada archivo debe distribuirse con autorización de su autor. La sincronización **no instala Minecraft ni Java** y no elimina automáticamente archivos no incluidos en el manifiesto.

## Próximas tareas

1. Motor de Minecraft Java y autenticación Microsoft oficial.
2. Instalación automática de Java, Minecraft y cargadores.
3. Portadas, skin real y catálogo de modpacks.
4. Integrar ZIPs/exportaciones de CurseForge respetando licencias.
5. Pruebas completas de instalación y ejecución en Windows.

## Inicio de sesión directo Microsoft (v0.9.0)

Se ha implementado OAuth 2.0 Authorization Code + PKCE con navegador oficial de Microsoft y retorno automático a la aplicación. Ya no se necesita introducir códigos de dispositivo ni el Client ID en cada PC. Una vez validado el perfil de Minecraft Java, se muestra el nombre y la cabeza de la skin con su UUID. El inicio de Minecraft con JUGAR sigue pendiente.

**Configuración obligatoria del administrador (una sola vez):** registrar una aplicación pública en Microsoft Entra con soporte para **cuentas personales de Microsoft**, agregar el redirect URI `http://localhost` bajo *Mobile and desktop applications*, y conseguir autorización para Minecraft Services. Configurar la variable de repositorio de GitHub Actions `UMBRAL_MICROSOFT_CLIENT_ID` con el Application (client) ID de esa aplicación. El workflow incrusta el ID público en `src/microsoft-app.json` al compilar, sin pedir datos a los jugadores. Si la variable no está configurada, la aplicación muestra un error informativo en lugar de simular que la sesión funciona.

No se almacenan contraseñas. Los tokens de actualización se guardan cifrados cuando Electron safeStorage está disponible. **No se ha realizado una prueba de autenticación de extremo a extremo:** un client ID sin la autorización necesaria puede recibir HTTP 403 de Minecraft Services. No usar credenciales de otra aplicación ni eludir controles de Microsoft.
