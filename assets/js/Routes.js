import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { View } from 'react-native';
import auth from '@react-native-firebase/auth';
import axios from 'axios';
import Config from "react-native-config";
import perf from '@react-native-firebase/perf';
import analytics from '@react-native-firebase/analytics';
import crashlytics from '@react-native-firebase/crashlytics';
import FastImage from 'react-native-fast-image';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useContextSelector } from 'use-context-selector';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { register, preload } from 'react-native-bundle-splitter';
import RNUxcam from 'react-native-ux-cam';

import  {AuthContext} from './AuthProvider';
const AuthStack = register({ loader: () => import('./AuthStack'), name: 'AuthStack' });
const AppStack = register({ loader: () => import('./AppStack'), name: 'AppStack' });
import { navigationRef } from './RootNavigation';

export default function Routes() {

     // Set an initializing state whilst Firebase connects
     const user = useContextSelector(AuthContext, state => state.user);
     const setUser = useContextSelector(AuthContext, state => state.setUser);
     const [initializing, setInitializing] = useState(true);
     const routeNameRef = useRef();

     const instantLogout = async () => {
      try {
        const currentUser = await GoogleSignin.getCurrentUser();
        const jsonValue = await AsyncStorage.getItem('@guest_Id');
        if(jsonValue !== null) {
          await AsyncStorage.removeItem('@guest_Id');
          await auth().signOut();
        }
        if (currentUser) {
          await GoogleSignin.revokeAccess();
          await GoogleSignin.signOut();
          await auth().signOut();
        }
        else {
          await auth().signOut();
        }
      }
      catch (err) {
        crashlytics().log('instant logout error.');
        crashlytics().recordError(err);
        console.log(err);
      }
    }

     // Handle user state changes
     const onAuthStateChanged = async (user) => {
      try {
        if (user) {
          if (auth().currentUser.emailVerified === false) {
            await preload().component('AuthStack');
            setUser(null);
            if (initializing) setInitializing(false);
          }
          else if (auth().currentUser.emailVerified === null) {
            await preload().component('AuthStack');
            setUser(null);
            if (initializing) setInitializing(false);
          }
          else if (auth().currentUser.emailVerified === true) {
            const res = await verifyToken();
              if(res === 'Authorized') {
                await preload().component('AppStack');
                setUser(user);
                if (initializing) setInitializing(false);
              }
              else {
                await instantLogout();
                await preload().component('AuthStack');
                setUser(null);
                if (initializing) setInitializing(false);
              }
          }
          else {
            await instantLogout();
            await preload().component('AuthStack');
            setUser(null);
            if (initializing) setInitializing(false);
          }
        }
        else {
          await preload().component('AuthStack');
          setUser(null);
          if (initializing) setInitializing(false);
        }
      }
      catch (err) {
        console.log(err);
        await preload().component('AuthStack');
        setUser(null);
        if (initializing) setInitializing(false);
        crashlytics().log('authstate error.');
        crashlytics().recordError(err);
      }
    }

    const verifyToken = async () => {
      try {
        const idToken = await auth().currentUser.getIdToken(true);
        console.log(Config.USER_VERIFYTOKEN_API);
        const httpMetric = perf().newHttpMetric(Config.USER_VERIFYTOKEN_API, 'POST');
        httpMetric.putAttribute('user_token', 'customer');
        await httpMetric.start();
        const checkUser = await axios.post(Config.USER_VERIFYTOKEN_API,
          {
            idToken,
          }
        );
        httpMetric.setHttpResponseCode(checkUser.status);
        httpMetric.setResponseContentType(checkUser.headers['content-type']);
        await httpMetric.stop();
        if(checkUser.data === 'Authorized') {
          return 'Authorized';
        }
        else if(checkUser.data === 'Unauthorized') {
          return 'Unauthorized';
        }
        else {
          return checkUser.data;
        }
      }
      catch (e) {
        crashlytics().log('verify session token error.');
        crashlytics().recordError(e);
        console.log('routes',e);
      }
    }

    useEffect(() => {
        // setTimeout(() =>{
          const subscriber = auth().onAuthStateChanged(onAuthStateChanged);
          return () => subscriber(); // unsubscribe on unmount
        // }, 100);
      }, []);

      if (initializing) {
        return (
          <SafeAreaView style={{flex: 1, backgroundColor: 'rgba(255, 255, 255, 1)', alignItems: 'center', justifyContent: 'center'}}>
              <FastImage source={require('../assets/logo.webp')} style={{ width: 210, height: 220 }} resizeMode={FastImage.resizeMode.contain} />
        </SafeAreaView>
          );
    };

    return (
      <SafeAreaProvider>
        <NavigationContainer
            ref={navigationRef}
            onReady={() => {
              routeNameRef.current = navigationRef.current.getCurrentRoute().name;
            }}
            onStateChange={async () => {
              const previousRouteName = routeNameRef.current;
              const currentRouteName = navigationRef.current.getCurrentRoute().name;

              if (previousRouteName !== currentRouteName) {
                await analytics().logScreenView({
                  screen_name: currentRouteName,
                  screen_class: currentRouteName,
                });
                RNUxcam.tagScreenName(currentRouteName);
              }
              routeNameRef.current = currentRouteName;
            }}
          >
            {user ? <AppStack/> : <AuthStack/>}
        </NavigationContainer>
      </SafeAreaProvider>
    );
}