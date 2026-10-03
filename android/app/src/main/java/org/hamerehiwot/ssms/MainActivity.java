package org.hamerehiwot.ssms;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * Opens the Hamere Hiwot website full screen. On the first launch (Android 13
 * and later) it first asks for permission to show notifications, so requests
 * that need someone's approval reach their phone.
 */
public class MainActivity extends LauncherActivity {
    private static final int REQUEST_NOTIFICATIONS = 1;
    private static final String PREFS = "hamere_hiwot";
    private static final String ASKED = "asked_notifications";

    private boolean waitingForAnswer = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Decide before super.onCreate(), which launches the website unless told to wait
        waitingForAnswer = savedInstanceState == null && shouldAskForNotifications();
        super.onCreate(savedInstanceState);
        // The library may restart itself in a new task (e.g. opened from the installer);
        // then the new copy asks instead of this closing one
        if (isFinishing()) {
            waitingForAnswer = false;
            return;
        }
        if (waitingForAnswer) {
            prefs().edit().putBoolean(ASKED, true).apply();
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
        }
    }

    @Override
    protected boolean shouldLaunchImmediately() {
        return !waitingForAnswer;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_NOTIFICATIONS && waitingForAnswer) {
            // Open the website whatever the answer; it can be changed later in Android settings
            waitingForAnswer = false;
            launchTwa();
        }
    }

    private boolean shouldAskForNotifications() {
        if (Build.VERSION.SDK_INT < 33) return false; // older Android allows notifications by default
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return false;
        return !prefs().getBoolean(ASKED, false);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }
}
