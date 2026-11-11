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
 * BeeVisual main menu — Rival/Pulse Visual style:
 * purple gradient background, big purple buttons and a white round
 * particle trail that follows the mouse and fades out smoothly.
 */
public class CustomTitleScreen extends TitleScreen {

    private static final Identifier PARTICLE_TEX =
            Identifier.of("minecraft", "textures/particle/generic_4.png");
    private static final Identifier BACKGROUND =
            Identifier.of("beevisual", "textures/gui/background.png");

    // BeeVisual palette
    private static final int GRADIENT_TOP = 0xFF3B1E6E;
    private static final int GRADIENT_BOTTOM = 0xFF150B2B;
    private static final int BTN_BASE = 0xFF7C3AED;
    private static final int BTN_HOVER = 0xFF9165E8;
    private static final int BTN_BORDER = 0xFF4C1D95;
    private static final int TEXT_COLOR = 0xFFF5F3FF;
    private static final int TITLE_COLOR = 0xFFF3E8FF;

    private static final int BTN_WIDTH = 260;
    private static final int BTN_HEIGHT = 40;
    private static final int BTN_GAP = 10;

    private record MenuButton(int x, int y, int w, int h, Text label, Runnable action) {
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

    private static final class Orb {
        final float baseX, baseY, size, speed, phase;
        final int color;

        Orb(float baseX, float baseY, float size, float speed, float phase, int color) {
            this.baseX = baseX;
            this.baseY = baseY;
            this.size = size;
            this.speed = speed;
            this.phase = phase;
            this.color = color;
        }
    }

    private final List<MenuButton> buttons = new ArrayList<>();
    private final List<Particle> particles = new ArrayList<>();
    private final List<Orb> orbs = new ArrayList<>();
    private final Random random = new Random();

    private float time;
    private long lastFrameNanos = -1;

    public CustomTitleScreen() {
        super(false);
    }

    @Override
    protected void init() {
        buttons.clear();

        String[] labels = {"Одиночная игра", "Мультиплеер", "Настройки", "Выход"};
        int totalHeight = labels.length * BTN_HEIGHT + (labels.length - 1) * BTN_GAP;
        int startY = (int) (this.height * 0.46f) - totalHeight / 2 + 10;

        for (int i = 0; i < labels.length; i++) {
            int x = this.width / 2 - BTN_WIDTH / 2;
            int y = startY + i * (BTN_HEIGHT + BTN_GAP);
            final String label = labels[i];
            Runnable action = switch (label) {
                case "Одиночная игра" -> () -> this.client.setScreen(new SelectWorldScreen(this));
                case "Мультиплеер" -> () -> this.client.setScreen(new MultiplayerScreen(this));
                case "Настройки" -> () -> this.client.setScreen(new OptionsScreen(this, this.client.options));
                default -> () -> this.client.scheduleStop();
            };
            buttons.add(new MenuButton(x, y, BTN_WIDTH, BTN_HEIGHT, Text.literal(label), action));
        }

        // decorative purple glow orbs
        if (orbs.isEmpty()) {
            int[] glowColors = {0x307C3AED, 0x28A855F7, 0x266D28D9};
            for (int i = 0; i < 6; i++) {
                orbs.add(new Orb(
                        random.nextFloat() * 1.0f,             // fractions of screen size
                        random.nextFloat() * 1.0f,
                        80 + random.nextFloat() * 140,
                        0.2f + random.nextFloat() * 0.4f,
                        random.nextFloat() * (float) (Math.PI * 2),
                        glowColors[i % glowColors.length]));
            }
        }
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button == 0) {
            for (MenuButton b : buttons) {
                if (b.contains(mouseX, mouseY)) {
                    // click burst
                    for (int i = 0; i < 12; i++) {
                        spawnParticle((float) mouseX, (float) mouseY, 2.2f);
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
        // white trail behind the cursor
        spawnParticle((float) mouseX, (float) mouseY, 1.0f);
        spawnParticle((float) mouseX, (float) mouseY, 1.0f);
    }

    private void spawnParticle(float x, float y, float speed) {
        if (particles.size() > 300) {
            return; // safety cap
        }
        float angle = random.nextFloat() * (float) (Math.PI * 2);
        float v = (0.2f + random.nextFloat() * 0.6f) * speed;
        particles.add(new Particle(
                x + (random.nextFloat() - 0.5f) * 4,
                y + (random.nextFloat() - 0.5f) * 4,
                (float) Math.cos(angle) * v,
                (float) Math.sin(angle) * v - 0.15f,
                0.6f + random.nextFloat() * 0.6f,
                3.5f + random.nextFloat() * 3.0f));
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        // frame time in seconds (render delta is a partial tick, not frame time)
        long now = System.nanoTime();
        if (lastFrameNanos < 0) {
            lastFrameNanos = now;
        }
        float dt = Math.min((now - lastFrameNanos) / 1_000_000_000f, 0.1f);
        lastFrameNanos = now;
        time += dt;

        // --- background ---
        if (this.client.getResourceManager().getResource(BACKGROUND).isPresent()) {
            RenderSystem.setShaderTexture(0, BACKGROUND);
            context.drawTexture(RenderLayer::getTextured, BACKGROUND, 0, 0, 0.0F, 0.0F,
                    this.width, this.height, this.width, this.height);
        } else {
            context.fillGradient(0, 0, this.width, this.height, GRADIENT_TOP, GRADIENT_BOTTOM);
        }

        // --- floating purple glow orbs ---
        for (Orb orb : orbs) {
            float ox = orb.baseX * this.width + (float) Math.sin(time * orb.speed + orb.phase) * 40f;
            float oy = orb.baseY * this.height + (float) Math.cos(time * orb.speed * 0.8f + orb.phase) * 30f;
            drawSoftCircle(context, ox, oy, orb.size, orb.color);
        }

        // --- title ---
        context.getMatrices().push();
        context.getMatrices().translate(this.width / 2f, this.height * 0.14f, 0);
        context.getMatrices().scale(4.0f, 4.0f, 1.0f);
        context.drawCenteredTextWithShadow(this.textRenderer, Text.literal("BeeVisual"), 0, 0, TITLE_COLOR);
        context.getMatrices().pop();
        context.drawCenteredTextWithShadow(this.textRenderer, Text.literal("визуалы для твоего лаунчера"),
                this.width / 2, (int) (this.height * 0.14f) + 46, 0xB89CA3AF);

        // --- buttons ---
        for (MenuButton b : buttons) {
            boolean hovered = b.contains(mouseX, mouseY);
            int body = hovered ? BTN_HOVER : BTN_BASE;

            // shadow
            context.fill(b.x() + 3, b.y() + 4, b.x() + b.w() + 3, b.y() + b.h() + 4, 0x55000000);
            // border
            context.fill(b.x(), b.y(), b.x() + b.w(), b.y() + b.h(), BTN_BORDER);
            // body
            context.fill(b.x() + 2, b.y() + 2, b.x() + b.w() - 2, b.y() + b.h() - 2, body);
            // top highlight
            context.fill(b.x() + 2, b.y() + 2, b.x() + b.w() - 2, b.y() + 6, hovered ? 0x59FFFFFF : 0x33FFFFFF);

            context.drawCenteredTextWithShadow(this.textRenderer, b.label(),
                    b.x() + b.w() / 2, b.y() + (b.h() - 8) / 2, TEXT_COLOR);
        }

        // --- mouse trail particles ---
        Iterator<Particle> it = particles.iterator();
        while (it.hasNext()) {
            Particle p = it.next();
            p.life -= dt;
            if (p.life <= 0) {
                it.remove();
                continue;
            }
            p.x += p.vx * dt * 60f;
            p.y += p.vy * dt * 60f;
            p.vy += dt * 30f; // slight upward drift is negative vy already; add gentle fall
            float k = p.life / p.maxLife;
            int alpha = (int) (k * k * 255); // smooth fade-out
            if (alpha > 0) {
                drawSoftCircle(context, p.x, p.y, p.size, (alpha << 24) | 0xFFFFFF);
            }
        }

        // --- corner info ---
        context.drawTextWithShadow(this.textRenderer, Text.literal("Minecraft 1.21.4"), 6, this.height - 14, 0x809CA3AF);
        String modName = "BeeVisual UI";
        context.drawTextWithShadow(this.textRenderer, Text.literal(modName),
                this.width - 6 - this.textRenderer.getWidth(modName), this.height - 14, 0x809CA3AF);
    }

    private void drawSoftCircle(DrawContext context, float x, float y, float radius, int argb) {
        RenderSystem.setShaderTexture(0, PARTICLE_TEX);
        int d = (int) (radius * 2);
        context.drawTexture(RenderLayer::getTextured, PARTICLE_TEX,
                (int) (x - radius), (int) (y - radius), 0.0F, 0.0F,
                d, d, 8, 8, 8, 8, argb);
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }
}
