import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { LivenessPrompt, LivenessVerifyResponse } from '../api/liveness';
import BvnEntryScreen from '../screens/BvnEntryScreen';
import InstructionsScreen from '../screens/InstructionsScreen';
import FaceCaptureScreen from '../screens/FaceCaptureScreen';
import ResultsScreen from '../screens/ResultsScreen';

export type RootStackParamList = {
  BvnEntry: undefined;
  Instructions: {
    bvn: string;
    accountNo: string;
    sessionId: string;
    customerId: string;
    nonce: string;
    prompts: LivenessPrompt[];
    expiresAt: string;
  };
  FaceCapture: {
    bvn: string;
    accountNo: string;
    sessionId: string;
    customerId: string;
    nonce: string;
    prompts: LivenessPrompt[];
    expiresAt: string;
  };
  Results: {
    bvn: string;
    accountNo: string;
    result: LivenessVerifyResponse;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="BvnEntry"
        screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      >
        <Stack.Screen name="BvnEntry" component={BvnEntryScreen} />
        <Stack.Screen name="Instructions" component={InstructionsScreen} />
        <Stack.Screen
          name="FaceCapture"
          component={FaceCaptureScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="Results"
          component={ResultsScreen}
          options={{ gestureEnabled: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
