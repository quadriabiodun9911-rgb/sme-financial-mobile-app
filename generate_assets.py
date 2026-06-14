"""Generate Quad360 app icon assets using PIL."""
from PIL import Image, ImageDraw, ImageFont
import math, os

NAVY  = (18, 32, 60)       # dark navy background
BLUE  = (37, 145, 220)     # bright blue Q

def rounded_rect_mask(size, radius):
    img = Image.new("L", size, 0)
    d   = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size[0]-1, size[1]-1], radius=radius, fill=255)
    return img

def draw_icon(canvas_size, icon_frac=0.55):
    """Draw the Q-icon (navy rounded square + blue Q with arrow tail)."""
    img  = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # --- rounded-square background ---
    sq  = int(canvas_size * icon_frac)
    off = (canvas_size - sq) // 2
    r   = int(sq * 0.22)
    draw.rounded_rectangle([off, off, off+sq-1, off+sq-1], radius=r, fill=NAVY+(255,))

    # --- Q ring ---
    cx = canvas_size // 2
    cy = off + sq // 2 - int(sq * 0.03)
    outer_r = int(sq * 0.30)
    inner_r = int(sq * 0.18)
    # draw thick arc (full circle)
    for angle in range(360):
        for rad in range(inner_r, outer_r):
            x = cx + int(rad * math.cos(math.radians(angle)))
            y = cy + int(rad * math.sin(math.radians(angle)))
            img.putpixel((x, y), BLUE+(255,))

    # --- Q tail (diagonal arrow going bottom-right) ---
    tail_x1 = cx + int(outer_r * 0.45)
    tail_y1 = cy + int(outer_r * 0.45)
    tail_x2 = cx + int(outer_r * 0.95)
    tail_y2 = cy + int(outer_r * 0.95)
    lw = max(3, int(sq * 0.055))
    draw.line([tail_x1, tail_y1, tail_x2, tail_y2], fill=BLUE+(255,), width=lw)
    # arrowhead
    head_len = lw * 2
    draw.line([tail_x2, tail_y2, tail_x2 - head_len, tail_y2], fill=BLUE+(255,), width=lw)
    draw.line([tail_x2, tail_y2, tail_x2, tail_y2 - head_len], fill=BLUE+(255,), width=lw)

    return img

def make_icon(size):
    """Square icon: navy background fills entire square, Q centered."""
    img  = Image.new("RGBA", (size, size), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    # Full navy fill
    r = int(size * 0.22)
    draw.rounded_rectangle([0, 0, size-1, size-1], radius=r, fill=NAVY+(255,))

    # Q ring
    cx = size // 2
    cy = size // 2
    outer_r = int(size * 0.30)
    inner_r = int(size * 0.18)
    # Efficient filled ring using two ellipses
    draw.ellipse([cx-outer_r, cy-outer_r, cx+outer_r, cy+outer_r], fill=BLUE+(255,))
    draw.ellipse([cx-inner_r, cy-inner_r, cx+inner_r, cy+inner_r], fill=NAVY+(255,))

    # Tail
    lw   = max(4, int(size * 0.06))
    t1x  = cx + int(inner_r * 0.6)
    t1y  = cy + int(inner_r * 0.6)
    t2x  = cx + int(outer_r * 0.9)
    t2y  = cy + int(outer_r * 0.9)
    draw.line([t1x, t1y, t2x, t2y], fill=BLUE+(255,), width=lw)

    return img

def make_splash(size):
    """Splash: white background, icon + QUAD360 text centred."""
    img  = Image.new("RGBA", (size, size), (255,255,255,255))
    # Icon in upper-centre
    icon_size = int(size * 0.25)
    icon = make_icon(icon_size)
    ix   = (size - icon_size) // 2
    iy   = int(size * 0.30)
    img.paste(icon, (ix, iy), icon)

    # Text below
    draw = ImageDraw.Draw(img)
    font_size = int(size * 0.09)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except:
        font = ImageFont.load_default()
    text = "QUAD360"
    bbox = draw.textbbox((0,0), text, font=font)
    tw   = bbox[2] - bbox[0]
    tx   = (size - tw) // 2
    ty   = iy + icon_size + int(size * 0.04)
    draw.text((tx, ty), text, fill=NAVY+(255,), font=font)

    return img

def make_favicon(size):
    icon = make_icon(size)
    bg   = Image.new("RGBA", (size, size), (255,255,255,0))
    bg.paste(icon, (0,0), icon)
    return bg

assets_dir = os.path.join(os.path.dirname(__file__), "assets")
os.makedirs(assets_dir, exist_ok=True)

print("Generating icon.png  (1024×1024)...")
make_icon(1024).save(os.path.join(assets_dir, "icon.png"))

print("Generating adaptive-icon.png  (1024×1024)...")
make_icon(1024).save(os.path.join(assets_dir, "adaptive-icon.png"))

print("Generating splash.png  (2048×2048)...")
make_splash(2048).save(os.path.join(assets_dir, "splash.png"))

print("Generating favicon.png  (196×196)...")
make_favicon(196).save(os.path.join(assets_dir, "favicon.png"))

print("Done!")
