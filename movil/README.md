# App de Android

Una app de verdad (Capacitor) que abre la web a pantalla completa. Como el contenido es la web, lo que
cambiamos llega solo; solo hay que volver a fabricarla si cambia algo de esta carpeta (icono, nombre...).

GitHub Actions la fabrica (`.github/workflows/android.yml`), la firma y la deja en `public/app/`, y la
web la sirve en `/descargar`.

## La llave de firma (una sola vez)

Android solo deja instalar una versión nueva encima de la vieja si las dos llevan la misma firma. La llave
se crea una vez, se guarda en los secretos de GitHub y **no se pierde** (guarda una copia fuera del ordenador).

En PowerShell, con Java instalado:

```powershell
keytool -genkeypair -keystore fantasy.jks -alias fantasy -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Asistente Fantasy"
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\fantasy.jks")) | Set-Clipboard
```

`keytool` pide una contraseña: invéntala y apúntala. El segundo comando copia la llave al portapapeles.

En GitHub → Settings → Secrets and variables → Actions → New repository secret:

- `ANDROID_KEYSTORE_B64`: pega lo del portapapeles
- `ANDROID_KEYSTORE_PASSWORD`: la contraseña

Luego, Actions → **App Android** → Run workflow. En unos minutos está en `/descargar`.

## Probar en local

`npm ci`, `npx cap sync android` y abrir `android/` con Android Studio.
