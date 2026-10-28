import { StyleSheet, Text, View } from 'react-native';
import type { GenerateMetadataFunction } from 'expo-router/server';
import { APP_NAME } from '@/config';

export const generateMetadata: GenerateMetadataFunction = () => ({ title: APP_NAME });

export default function Home() {
  return (
    <View style={styles.page}>
      <Text accessibilityRole="header" style={styles.title}>
        {APP_NAME}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  title: { fontSize: 28, fontWeight: '600', textAlign: 'center', color: '#172b3a', maxWidth: 600 },
});
