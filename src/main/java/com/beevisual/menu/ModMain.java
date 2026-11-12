package com.beevisual.menu;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.TitleScreen;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ModMain implements ClientModInitializer {
    public static final Logger LOG = LoggerFactory.getLogger("beevisual-ui");

    @Override
    public void onInitializeClient() {
        // Fallback for title screens created after startup. The primary replacement
        // happens in MinecraftClientMixin before vanilla can display the screen.
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (client.currentScreen instanceof TitleScreen
                    && !(client.currentScreen instanceof CustomTitleScreen)) {
                client.setScreen(new CustomTitleScreen());
            }
        });
        LOG.info("BeeVisual UI mod loaded");
    }
}
