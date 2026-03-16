import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/types';
import DashboardScreen from './src/screens/DashboardScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import ReviewScreen from './src/screens/ReviewScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Dashboard"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#0F172A',
          },
          headerTintColor: '#F8FAFC',
          headerTitleStyle: {
            fontWeight: '700',
          },
          contentStyle: {
            backgroundColor: '#0F172A',
          },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{
            title: 'Escáner',
            headerBackTitle: 'Volver',
          }}
        />
        <Stack.Screen
          name="Review"
          component={ReviewScreen}
          options={{
            title: 'Resumen de Lote',
            headerBackTitle: 'Escáner',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
