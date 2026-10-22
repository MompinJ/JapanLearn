import { Suspense, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { bootstrapDatabase } from '@/db/bootstrap';
import { useAppFonts } from '@/ui/fonts';
import { deleteContentDb, readContentState } from '@/db/paths';
import contentVersion from '@/assets/db/content-version.json';

SplashScreen.preventAutoHideAsync().catch(() => {});
// Red de seguridad: si algo falla antes de que se pinte la primera tarjeta,
// el splash no debe quedarse pegado para siempre ocultando el error.
setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 10000);

function Boot() {
  return (
    <View style={styles.boot}>
      <ActivityIndicator />
    </View>
  );
}

export default function RootLayout() {
  // ContentGate: decide si hay que reemplazar la BD de contenido ANTES de
  // montar SQLiteProvider. Si la version cambio, se borran el .db y sus
  // sidecars -wal/-shm: un -wal huerfano sobre un .db recien copiado da
  // "database disk image is malformed".
  const [force, setForce] = useState<boolean | null>(null);
  const { loaded: fontsLoaded } = useAppFonts();

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') { setForce(false); return; }
      try {
        const installed = await readContentState();
        const needs = installed?.version !== contentVersion.version;
        if (needs) deleteContentDb();
        setForce(needs);
        // El estado NO se escribe aqui: lo marca bootstrapDatabase cuando la
        // copia y las migraciones han terminado bien.
      } catch {
        setForce(false);
      }
    })();
  }, []);

  // Se espera a la fuente: pintar japones con la del sistema, aunque sea un
  // instante, puede mostrar glifos chinos.
  if (force === null || !fontsLoaded) return null; // el splash sigue puesto

  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <Suspense fallback={<Boot />}>
          <SQLiteProvider
            databaseName="japanese.db"
            // En web no se puede copiar el asset (no hay expo-file-system):
            // el contenido lo siembra bootstrapDatabase.
            assetSource={Platform.OS === 'web'
              ? undefined
              : { assetId: require('@/assets/db/japanese.db'), forceOverwrite: force }}
            onInit={bootstrapDatabase}
            useSuspense
          >
            <Stack screenOptions={{ headerShown: false }} />
          </SQLiteProvider>
        </Suspense>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#faf9f7' },
});
