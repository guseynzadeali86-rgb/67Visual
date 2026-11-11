package com.beevisual.menu;

import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.gui.DrawableHelper;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

public class CustomTitleScreen extends TitleScreen {
    private static final Identifier BACKGROUND = new Identifier("beevisual", "textures/gui/background.png");
    private static final int PANEL_WIDTH = 400;
    private static final int PANEL_HEIGHT = 300;

    public CustomTitleScreen(TitleScreen original) {
        super(null);
        // Preserve original screen properties if needed
    }

    @Override
    public void init() {
        super.init();
        // Remove default buttons
        this.clearChildren();
        int centerX = this.width / 2;
        int startY = (this.height - PANEL_HEIGHT) / 2 - 20;
        int btnW = 180;
        int btnH = 20;
        int gap = 4;
        String[] labels = {"Singleplayer", "Multiplayer", "Settings", "Quit"};
        for (int i = 0; i < labels.length; i++) {
            int y = startY + i * (btnH + gap);
            this.addDrawableChild(new ButtonWidget(centerX - btnW/2, y, btnW, btnH,
                    Text.translatable(labels[i].toLowerCase()), button -> {
                switch (labels[i]) {
                    case "Singleplayer": this.client.setScreen(new net.minecraft.client.gui.screen.world.SelectWorldScreen(this)); break;
                    case "Multiplayer": this.client.setScreen(new net.minecraft.client.gui.screen.multiplayer.MultiplayerScreen(this)); break;
                    case "Settings": this.client.setScreen(new net.minecraft.client.gui.screen.option.OptionsScreen(this, this.client.options)); break;
                    case "Quit": this.client.scheduleStop(); break;
                }
            }));
        }
    }

    @Override
    public void render(MatrixStack matrices, int mouseX, int mouseY, float delta) {
        // draw background gradient
        fill(matrices, 0, 0, this.width, this.height, 0xFF281050);
        // draw custom background image if present
        if (this.client.getTextureManager().getTexture(BACKGROUND) != null) {
            this.client.getTextureManager().bindTexture(BACKGROUND);
            DrawableHelper.drawTexture(matrices, (this.width - PANEL_WIDTH)/2, (this.height - PANEL_HEIGHT)/2 - 20, 0, 0, PANEL_WIDTH, PANEL_HEIGHT, PANEL_WIDTH, PANEL_HEIGHT);
        }
        super.render(matrices, mouseX, mouseY, delta);
    }
}
