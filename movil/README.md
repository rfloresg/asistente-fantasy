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

## Avisos en el móvil (una sola vez)

Dos vías: **Web Push** (la app instalada desde la web, iPhone y Android) y **Firebase** (esta app de Android).
Sin estas llaves todo funciona igual, solo que no llegan avisos al móvil.

### 1. Web Push (llaves VAPID)

En la carpeta del proyecto:

```powershell
npx web-push generate-vapid-keys
```

Salen dos llaves (Public Key y Private Key). Guárdalas:

- **Vercel** → Settings → Environment Variables: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = la pública, `VAPID_PRIVATE_KEY` = la privada. Luego Redeploy.
- **GitHub** → Settings → Secrets → Actions: `VAPID_PUBLIC_KEY` = la pública, `VAPID_PRIVATE_KEY` = la privada.

### 2. Firebase (app de Android)

1. https://console.firebase.google.com → Crear proyecto (gratis, sin Analytics).
2. Añadir app → Android → nombre del paquete `com.rfloresg.asistentefantasy` → Registrar → **Descargar google-services.json**.
3. En GitHub, secreto `GOOGLE_SERVICES_JSON` = el contenido del archivo (ábrelo con el Bloc de notas y copia todo).
4. Firebase → ⚙️ Configuración del proyecto → Cuentas de servicio → **Generar nueva clave privada** (descarga un .json).
5. Ese .json, en GitHub como secreto `FCM_SERVICE_ACCOUNT` y en Vercel como variable `FCM_SERVICE_ACCOUNT` (todo el contenido). Es una llave: no la subas a Git ni la mandes por chat.
6. Actions → **App Android** → Run workflow, para fabricar la app con los avisos. Hay que instalar la nueva versión encima.
