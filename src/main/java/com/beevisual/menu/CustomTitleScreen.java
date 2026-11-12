package com.beevisual.menu;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.gui.screen.multiplayer.MultiplayerScreen;
import net.minecraft.client.gui.screen.option.OptionsScreen;
import net.minecraft.client.gui.screen.world.SelectWorldScreen;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Random;

/**
 * BeeVisual main menu.
 *
 * Background + logo + buttons come from the user's own asset pack
 * (assets/beevisual/textures/gui/...). Everything is drawn with plain
 * DrawContext.fill / drawTexture calls so it compiles on 1.21.4 without
 * extra mappings.
 *
 * Mouse trail: small white round particles spawn where the cursor moves,
 * drift a little and fade out smoothly.
 */
public class CustomTitleScreen extends TitleScreen {

    private static final String NS = "beevisual";

    private static final Identifier BACKGROUND = Identifier.of(NS, "textures/gui/background.png");
    private static final Identifier LOGO = Identifier.of(NS, "textures/gui/logo.png");
    private static final Identifier PARTICLE_TEX =
            Identifier.of("minecraft", "textures/particle/generic_4.png");

    // Fallback palette (used only if the asset pack is missing)
    private static final int GRADIENT_TOP = 0xFF3B1E6E;
    private static final int GRADIENT_BOTTOM = 0xFF150B2B;
    private static final int TEXT_COLOR = 0xFFF5F3FF;

    // Layout: the asset pack is built for a 1920x1080 canvas
    private static final int CANVAS_W = 1920;
    private static final int CANVAS_H = 1080;
    private static int BTN_W = 420;
    private static int BTN_H = 72;
    private static int BTN_GAP = 24;

    private record MenuButton(int x, int y, int w, int h, String key, Text label, Runnable action) {
        boolean contains(double mx, double my) {
            return mx >= x && mx <= x + w && my >= y && my <= y + h;
        }
    }

    private static final class Particle {
        float x, y, vx, vy, life, maxLife, size;

        Particle(float x, float y, float vx, float vy, float life, float size) {
            this.x = x;
            this.y = y;
            this.vx = vx;
            this.vy = vy;
            this.life = life;
            this.maxLife = life;
            this.size = size;
        }
    }

    private final List<MenuButton> buttons = new ArrayList<>();
    private final List<Particle> particles = new ArrayList<>();
    private final Random random = new Random();

    private float lastMouseX = -1f;
    private float lastMouseY = -1f;
    private float trailTimer;
    private long lastFrameNanos = -1L;

    public CustomTitleScreen() {
        super(false);
    }

    @Override
    protected void init() {
        buttons.clear();

        // Buttons are placed where the asset pack's preview puts them
        // (left column, vertically centred).
        int startY = (int) (this.height * 0.5f) - (4 * BTN_H + 3 * BTN_GAP) / 2;
        int x = (int) (this.width * 0.5f) - BTN_W / 2;

        addButton(x, startY + 0 * (BTN_H + BTN_GAP), "singleplayer", "Одиночная игра",
                () -> this.client.setScreen(new SelectWorldScreen(this)));
        addButton(x, startY + 1 * (BTN_H + BTN_GAP), "multiplayer", "Мультиплеер",
                () -> this.client.setScreen(new MultiplayerScreen(this)));
        addButton(x, startY + 2 * (BTN_H + BTN_GAP), "options", "Настройки",
                () -> this.client.setScreen(new OptionsScreen(this, this.client.options)));
        addButton(x, startY + 3 * (BTN_H + BTN_GAP), "quit", "Выход",
                () -> this.client.scheduleStop());
    }

    private void addButton(int x, int y, String key, String label, Runnable action) {
        buttons.add(new MenuButton(x, y, BTN_W, BTN_H, key, Text.literal(label), action));
    }

    private Identifier buttonTexture(String key, boolean hovered) {
        return Identifier.of(NS, "textures/gui/button_" + key + (hovered ? "_hover" : "") + ".png");
    }

    private boolean has(Identifier id) {
        return this.client != null
                && this.client.getResourceManager().getResource(id).isPresent();
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button == 0) {
            for (MenuButton b : buttons) {
                if (b.contains(mouseX, mouseY)) {
                    for (int i = 0; i < 14; i++) {
                        spawnParticle((float) mouseX, (float) mouseY, 2.4f);
                    }
                    b.action().run();
                    return true;
                }
            }
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public void mouseMoved(double mouseX, double mouseY) {
        super.mouseMoved(mouseX, mouseY);

        float dx = lastMouseX < 0 ? 0 : (float) mouseX - lastMouseX;
        float dy = lastMouseY < 0 ? 0 : (float) mouseY - lastMouseY;
        float speed = (float) Math.sqrt(dx * dx + dy * dy);
        lastMouseX = (float) mouseX;
        lastMouseY = (float) mouseY;

        // One particle per ~4 px of movement, so the trail stays even.
        trailTimer += speed;
        while (trailTimer > 4f) {
            trailTimer -= 4f;
            spawnParticle((float) mouseX, (float) mouseY, 1f);
        }
    }

    private void spawnParticle(float x, float y, float speed) {
        if (particles.size() > 400) {
            return;
        }
        float angle = random.nextFloat() * (float) (Math.PI * 2);
        float v = (0.15f + random.nextFloat() * 0.45f) * speed;
        particles.add(new Particle(
                x + (random.nextFloat() - 0.5f) * 6f,
                y + (random.nextFloat() - 0.5f) * 6f,
                (float) Math.cos(angle) * v,
                (float) Math.sin(angle) * v,
                0.8f + random.nextFloat() * 0.8f,
                2.5f + random.nextFloat() * 3.5f));
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        long now = System.nanoTime();
        if (lastFrameNanos < 0) {
            lastFrameNanos = now;
        }
        float dt = Math.min((now - lastFrameNanos) / 1_000_000_000f, 0.1f);
        lastFrameNanos = now;

        // --- background ---
        if (has(BACKGROUND)) {
            RenderSystem.setShaderTexture(0, BACKGROUND);
            context.drawTexture(RenderLayer::getGuiTextured, BACKGROUND, 0, 0, 0.0F, 0.0F,
                    this.width, this.height, this.width, this.height);
        } else {
            context.fillGradient(0, 0, this.width, this.height, GRADIENT_TOP, GRADIENT_BOTTOM);
        }

        // --- logo ---
        if (has(LOGO)) {
            int logoW = Math.min((int) (this.width * 0.30f), 460);
            int logoH = (int) (logoW * (300f / 1200f));
            int logoX = this.width / 2 - logoW / 2;
            int logoY = (int) (this.height * 0.10f);
            RenderSystem.setShaderTexture(0, LOGO);
            context.drawTexture(RenderLayer::getGuiTextured, LOGO, logoX, logoY, 0.0F, 0.0F,
                    logoW, logoH, logoW, logoH);
        } else {
            context.getMatrices().push();
            context.getMatrices().translate(this.width / 2f, this.height * 0.16f, 0);
            context.getMatrices().scale(3.0f, 3.0f, 1.0f);
            context.drawCenteredTextWithShadow(this.textRenderer, Text.literal("BeeVisual"), 0, 0, TEXT_COLOR);
            context.getMatrices().pop();
        }

        // --- buttons ---
        for (MenuButton b : buttons) {
            boolean hovered = b.contains(mouseX, mouseY);
            Identifier tex = buttonTexture(b.key(), hovered);
            Identifier fallback = buttonTexture("normal", false);

            if (has(tex)) {
                RenderSystem.setShaderTexture(0, tex);
                context.drawTexture(RenderLayer::getGuiTextured, tex, b.x(), b.y(), 0.0F, 0.0F,
                        b.w(), b.h(), b.w(), b.h());
            } else if (has(fallback)) {
                RenderSystem.setShaderTexture(0, fallback);
                context.drawTexture(RenderLayer::getGuiTextured, fallback, b.x(), b.y(), 0.0F, 0.0F,
                        b.w(), b.h(), b.w(), b.h());
            } else {
                context.fill(b.x(), b.y(), b.x() + b.w(), b.y() + b.h(), hovered ? 0xFF9165E8 : 0xFF7C3AED);
            }

            context.getMatrices().push();
            context.getMatrices().translate(b.x() + b.w() / 2f, b.y() + b.h() / 2f, 0);
            context.getMatrices().scale(2.0f, 2.0f, 1.0f);
            context.drawCenteredTextWithShadow(this.textRenderer, b.label(), 0, 0, TEXT_COLOR);
            context.getMatrices().pop();
        }

        // --- mouse trail particles ---
        Iterator<Particle> it = particles.iterator();
        while (it.hasNext()) {
            Particle p = it.next();
            p.life -= dt;
            if (p.life <= 0f) {
                it.remove();
                continue;
            }
            p.x += p.vx * dt * 60f;
            p.y += p.vy * dt * 60f;
            p.vx *= 0.985f;
            p.vy *= 0.985f;

            float k = p.life / p.maxLife;          // 1 -> 0
            int alpha = (int) (k * k * 235f);      // smooth fade out
            if (alpha <= 0) {
                continue;
            }
            int size = (int) Math.max(2f, p.size * (0.55f + 0.45f * k));
            drawSoftCircle(context, p.x, p.y, size, (alpha << 24) | 0xFFFFFF);
        }

        // --- corner info ---
        context.drawTextWithShadow(this.textRenderer, Text.literal("Minecraft 1.21.4"),
                6, this.height - 14, 0x809CA3AF);
        String modName = "BeeVisual UI";
        context.drawTextWithShadow(this.textRenderer, Text.literal(modName),
                this.width - 6 - this.textRenderer.getWidth(modName), this.height - 14, 0x809CA3AF);
    }

    private void drawSoftCircle(DrawContext context, float x, float y, float radius, int argb) {
        RenderSystem.setShaderTexture(0, PARTICLE_TEX);
        int d = (int) Math.max(2f, radius * 2f);
        context.drawTexture(RenderLayer::getGuiTextured, PARTICLE_TEX,
                (int) (x - radius), (int) (y - radius), 0.0F, 0.0F,
                d, d, 8, 8, 8, 8, argb);
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }
}
