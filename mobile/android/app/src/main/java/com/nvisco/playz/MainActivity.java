package com.nvisco.playz;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

/**
 * Thin native shell: Capacitor's WebView loads the live game from server.url (see capacitor.config.js).
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        webView.setBackgroundColor(Color.BLACK);
        // No stretchy glow / rubber-band effect at the edges of the page.
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true); // localStorage (login, saved progress)
        settings.setMediaPlaybackRequiresUserGesture(false); // sounds/video can start without a tap
    }
}
