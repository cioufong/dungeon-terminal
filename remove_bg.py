from PIL import Image

def remove_background(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    datas = img.getdata()

    newData = []
    for item in datas:
        # Check if pixel is white (or very close to white)
        # RGB > 240 considered white
        if item[0] > 240 and item[1] > 240 and item[2] > 240:
            newData.append((255, 255, 255, 0)) # Transparent
        else:
            newData.append(item)

    img.putdata(newData)
    img.save(output_path, "PNG")
    print(f"Saved to {output_path}")

if __name__ == "__main__":
    remove_background(
        "/Users/leo/project/nfa-rpg/frontend/src/assets/logo_raw.jpg",
        "/Users/leo/project/nfa-rpg/frontend/src/assets/logo.png"
    )
