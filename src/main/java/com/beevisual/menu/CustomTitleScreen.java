package com.beevisual.menu;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.gui.screen.multiplayer.MultiplayerScreen;
import net.minecraft.client.gui.screen.option.OptionsScreen;
import net.minecraft.client.gui.screen.world.SelectWorldScreen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

public class CustomTitleScreen extends TitleScreen {
    private static final Identifier BACKGROUND = Identifier.of("beevisual", "textures/gui/background.png");
    private static final int BTN_WIDTH = 200;
    private static final int BTN_HEIGHT = 20;
    private static final int GAP = 6;

    public CustomTitleScreen() {
        super(false);
    }

    @Override
    public void init() {
        super.init();
        this.clearChildren();

        String[] labels = {"Singleplayer", "Multiplayer", "Settings", "Quit"};
        int totalHeight = labels.length * BTN_HEIGHT + (labels.length - 1) * GAP;
        int startY = (this.height - totalHeight) / 2 + 10;

        for (int i = 0; i < labels.length; i++) {
            int y = startY + i * (BTN_HEIGHT + GAP);
            final String label = labels[i];
            this.addDrawableChild(ButtonWidget.builder(Text.translatable(label.toLowerCase()), button -> {
                switch (label) {
                    case "Singleplayer" -> this.client.setScreen(new SelectWorldScreen(this));
                    case "Multiplayer" -> this.client.setScreen(new MultiplayerScreen(this));
                    case "Settings" -> this.client.setScreen(new OptionsScreen(this, this.client.options));
                    case "Quit" -> this.client.scheduleStop();
                }
            }).dimensions(this.width / 2 - BTN_WIDTH / 2, y, BTN_WIDTH, BTN_HEIGHT).build());
        }
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        // purple background
        context.fill(0, 0, this.width, this.height, 0xFF281050);

        // custom background image if the resource exists
        if (this.client.getResourceManager().getResource(BACKGROUND).isPresent()) {
            RenderSystem.setShaderTexture(0, BACKGROUND);
            context.drawTexture(RenderLayer::getEntitySolid, BACKGROUND, 0, 0, 0.0F, 0.0F, this.width, this.height, this.width, this.height);
        }

        super.render(context, mouseX, mouseY, delta);
    }
}
