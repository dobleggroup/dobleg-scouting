# Publicar la app — pasos para la compu del trabajo

Guía para llevar **Doble G Scout** a Google Play y App Store. Lo que ya dejé hecho
en el código está marcado con ✅; lo que tenés que hacer vos, con ⬜.

**Datos base:**
- App ID: `group.dobleg.scout` · Nombre: `Doble G Scout`
- Sitio/Netlify: `https://dobleg-scouting.netlify.app`
- Supabase: `qgwmxjjumauortbwvivu.supabase.co`
- Política de privacidad (URL pública): `https://dobleg-scouting.netlify.app/privacidad.html`
  - ⬜ Revisá el email de contacto y la fecha en `public/privacidad.html`.

---

## 1. Eliminar cuenta (requisito Apple + Google) ✅ código / ⬜ deploy

- ✅ UI en **Perfil → Eliminar cuenta** (`src/pages/ProfilePage.tsx`), link en el menú de usuario.
- ✅ Función serverless `netlify/functions/delete-account.js` (borra el usuario con service role).
- ⬜ **En Netlify → Site settings → Environment variables**, agregá:
  - `SUPABASE_URL` = `https://qgwmxjjumauortbwvivu.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY` = (Supabase → Project Settings → API → `service_role` **secret**)
- ⬜ Redeploy de Netlify (push a `main` o "Trigger deploy"). Probá borrar una cuenta de prueba.

> Nota: la función borra el usuario de Auth. Si tenés tablas propias sin `ON DELETE CASCADE`
> (seguimiento, comentarios, etc.) y querés borrar también esas filas, se agrega en esa función.

## 2. Login con Apple (requisito Apple porque ya hay login Google) ✅ botón / ⬜ config

- ✅ Botón "Continuar con Apple" en el login (`src/components/auth/AuthModal.tsx`) +
  `signInWithApple` en `AuthContext`.
- ⬜ **Apple Developer** (con la cuenta de la agencia):
  1. Identifiers → App ID `group.dobleg.scout` con capability **Sign in with Apple**.
  2. Identifiers → **Services ID** (ej. `group.dobleg.scout.web`) para el login web/Supabase.
  3. Keys → crear una **Key** con Sign in with Apple (te da un `.p8` + Key ID).
- ⬜ **Supabase → Authentication → Providers → Apple**: pegá Services ID, Team ID, Key ID y el `.p8`.
- ⬜ **Supabase → Authentication → URL Configuration → Redirect URLs**: agregá
  `https://dobleg-scouting.netlify.app` (web) y, para la app, el deep link (ver punto 5).

## 3. Login con Google en la app (ya anda en web) ⬜ config nativa
- En web ya funciona. Para la **app nativa**, el OAuth necesita volver por un deep link:
  - ⬜ Supabase → Redirect URLs: agregá `group.dobleg.scout://login` (o el scheme que uses).
  - ⬜ Google Cloud Console → OAuth client: agregá ese redirect.
  - (En iOS Sign in with Apple conviene el plugin nativo; en Android el flujo por navegador alcanza.)

## 4. Android — Play Store ✅ signing config / ⬜ keystore + build + listing

- ✅ `android/app/build.gradle` ya tiene `signingConfigs.release` leyendo `android/keystore.properties`.
- ⬜ **Generar el keystore** (una sola vez), desde `android/`:
  ```
  keytool -genkey -v -keystore doble-g-scout.jks -keyalg RSA -keysize 2048 -validity 10000 -alias doble-g
  ```
  Guardá el `.jks` y las contraseñas en lugar seguro (si los perdés no podés actualizar la app).
- ⬜ Copiá `android/keystore.properties.example` → `android/keystore.properties` y completá.
- ⬜ **Build del AAB** (lo que sube a Play), desde `android/`:
  ```
  set JAVA_HOME=C:\dev\jdk-21   (o export en bash)
  ./gradlew bundleRelease
  ```
  Sale en `android/app/build/outputs/bundle/release/app-release.aab`.
- ⬜ Antes de cada versión nueva: subí `versionCode` (y `versionName`) en `android/app/build.gradle`.
- ⬜ **Play Console**: crear la app, subir el AAB, completar:
  - Ficha: título, descripción corta/larga, ícono 512×512, feature graphic 1024×500, **capturas** (te las puedo generar).
  - **Política de privacidad**: la URL de arriba.
  - **Data safety**: declarar email/nombre (auth), sin venta de datos.
  - Content rating, países, precio (gratis).

## 5. iOS — App Store (necesita la Mac) ⬜
- ⬜ En la Mac, en el repo: `npx cap add ios` (Android ya está; iOS se agrega igual).
- ⬜ `npx cap sync ios` y abrir `ios/App/App.xcworkspace` en Xcode.
- ⬜ Signing & Capabilities: Team de la agencia + capability **Sign in with Apple**.
- ⬜ Deep link (URL scheme `group.dobleg.scout`) para el retorno del OAuth.
- ⬜ Archive → subir a **App Store Connect**, completar ficha + privacidad + botón de borrar cuenta (ya está en Perfil).

## 6. Recordatorios
- Ícono/splash ya están con el logo Doble G (`node scripts/make-app-assets.mjs && npx @capacitor/assets generate`).
- Cada cambio de web para la app: `npm run cap:sync` (build + copia a android/ios).
- El APK debug de prueba: `C:/Users/marcos/Desktop/doble-g-scout-debug.apk`.
