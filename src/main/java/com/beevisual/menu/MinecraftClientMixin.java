package com.beevisual.menu;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.TitleScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Replaces the vanilla title screen at the moment Minecraft tries to show it.
 * The client-tick fallback in ModMain remains useful for screens created by
 * third-party code after startup.
 */
@Mixin(MinecraftClient.class)
public class MinecraftClientMixin {
    @Inject(method = "setScreen", at = @At("HEAD"), cancellable = true)
    private void beevisual$replaceTitleScreen(Screen screen, CallbackInfo callbackInfo) {
        if (screen instanceof TitleScreen && !(screen instanceof CustomTitleScreen)) {
            callbackInfo.cancel();
            ((MinecraftClient) (Object) this).setScreen(new CustomTitleScreen());
        }
    }
}
