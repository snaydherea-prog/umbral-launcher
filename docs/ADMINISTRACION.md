# Publicar modpacks en Umbral

Esta versión prepara, publica y sincroniza archivos. El motor para instalar y ejecutar Minecraft sigue pendiente; no se debe presentar la preview como un launcher ya jugable.

## Preparar una versión

1. Abre **Ajustes → Administrar Umbral → Importar ZIP** y selecciona el ZIP exportado de CurseForge. Los borradores quedan guardados en tu PC.
2. Revisa Minecraft, cargador, Java, archivos incluidos y referencias pendientes. Una referencia pendiente bloquea la publicación.
3. Para un pack propio con archivos que puedas distribuir, completa Minecraft y la versión del cargador y usa **Importar carpeta**. Se incluyen `mods`, `config`, `defaultconfigs`, `resourcepacks`, `shaderpacks`, `kubejs`, `scripts` y `options.txt`. El resto queda fuera.
4. Revisa los archivos con **Abrir archivos del borrador**. Si editas una carpeta, vuelve a importarla antes de publicar: los hashes del borrador no se actualizan silenciosamente.

## Conectar tu cuenta

Solo la cuenta GitHub `snaydherea-prog` puede publicar. El backend de GitHub comprueba también sus permisos de escritura. Ocultar un botón no sustituye esta comprobación.

La conexión del plugin de ChatGPT no transfiere credenciales al launcher. Para el panel de escritorio se necesita un token personal de acceso específico a `umbral-launcher`, con **Contents: lectura y escritura**. Su creación o autorización es un paso separado que debe aprobar el propietario. No se ha generado ningún token durante este trabajo. No lo envíes por chat: se introduce únicamente en el campo protegido del launcher. Se elimina de la memoria del panel al desconectar o cerrar la aplicación.

## Publicar y actualizar

1. Conecta el administrador, selecciona el borrador y completa nombre, identificador, descripción y una versión nueva, por ejemplo `7.0.1-umbral.1`.
2. Pulsa **Publicar versión**. Los archivos serán públicos en GitHub Releases.
3. Umbral verifica las cargas antes de hacer visible la versión en `catalog/modpacks.json`. Si hay un error, no informa que la publicación terminó. Si GitHub cambia durante la operación, puede quedar una release o un borrador sin añadir al catálogo; se informa para revisarlo, sin borrar publicaciones automáticamente.
4. Para otra actualización, importa un ZIP o carpeta nueva, conserva el **mismo identificador** y aumenta la versión, por ejemplo `7.0.1-umbral.2`.
5. Los miembros abren el launcher o pulsan **Modpacks → Buscar novedades**, eligen el pack y usan **Descargar / Actualizar**. No necesitan tus credenciales ni reinstalar Umbral por cada cambio de contenido.

Los mods con URL individual se descargan si faltan o cambia su hash. Las configuraciones y recursos se agrupan por carpeta: si cambia un archivo de un grupo, se vuelve a descargar ese grupo. No se promete descargar un solo archivo cuando está dentro de un ZIP. Los grupos sin cambios no se descargan.

Antes de aplicar una actualización se comprueban todos los archivos descargados. `options.txt` existente se conserva; las configuraciones gestionadas se actualizan, guardando el original en `.umbral-backups`. Los archivos antiguos modificados por el jugador se conservan y se avisa para que los revise. Mundos, capturas y datos de cuenta permanecen fuera de la lista de rutas admitidas.

## KEO y CurseForge

KEO queda como borrador. La ficha revisada está en `catalog/sources/keo-rpg-optimized.json`, con el hash del ZIP entregado y sus 295 referencias.

La integración API está desactivada en `src/distribution.json`. No se debe activar solo por tener una clave: hay que confirmar que Overwolf aprueba la aplicación y el uso propuesto de metadatos y enlaces, teniendo en cuenta sus restricciones de almacenamiento. El borrador de solicitud describe esa arquitectura expresamente. No se construyen enlaces alternativos cuando la API no autoriza una descarga.

La API se usa únicamente en la administración y su clave no se guarda en borradores, manifiestos, repositorio ni instaladores. Los tokens de GitHub y de Microsoft tampoco se incorporan a los modpacks.

## Validación realizada

- Importación del ZIP proporcionado: NeoForge 21.1.248, 9.260 archivos preparados, 295 referencias pendientes; un archivo oculto excluido.
- Pruebas con ZIP malformado, rutas de Windows, enlaces, hashes incorrectos y descarga incompleta.
- Pruebas de actualización con mundos y ajustes existentes y un paquete de más de 2.000 archivos.
- Publicación probada con respuestas simuladas de GitHub: cuenta incorrecta, carga fallida, cambio concurrente del catálogo y publicación correcta.
- Prueba de interfaz con el catálogo y el panel de administración.

La prueba real de publicación desde la cuenta en el launcher, las descargas API de CurseForge y el arranque real de Minecraft aún requieren completar sus pasos pendientes.
