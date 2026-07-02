import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import ApiLogOverlay from './src/components/ApiLogOverlay';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppNavigator />
      <ApiLogOverlay />
    </SafeAreaProvider>
  );
}
