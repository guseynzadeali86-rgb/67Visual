package com.beevisual.menu;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.client.menu.v1.ClientMenuApi;
import net.minecraft.client.gui.screen.TitleScreen;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ModMain implements ModInitializer {
    public static final Logger LOG = LoggerFactory.getLogger("beevisual-ui");

    @Override
    public void onInitializeClient() {
        // Register custom TitleScreen handler
        ClientMenuApi.registerMenuHandler((manager, screen) -> {
            if (screen instanceof TitleScreen) {
                manager.setScreen(new CustomTitleScreen(screen));
            }
        });
        LOG.info("BeeVisual UI mod loaded");
    }
}
