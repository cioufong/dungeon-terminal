import { expect } from "chai";
import { ethers } from "hardhat";
import { NFARenderer } from "../typechain-types";

describe("NFARenderer", function () {
  let renderer: NFARenderer;

  beforeEach(async function () {
    const Factory = await ethers.getContractFactory("NFARenderer");
    renderer = (await Factory.deploy()) as unknown as NFARenderer;
    await renderer.waitForDeployment();
  });

  describe("renderSVG", function () {
    it("should generate valid SVG for all 30 race×class combinations", async function () {
      for (let race = 0; race < 5; race++) {
        for (let class_ = 0; class_ < 6; class_++) {
          const svg = await renderer.renderSVG(race, class_, 0, 0);
          expect(svg).to.include("<svg");
          expect(svg).to.include("</svg>");
          expect(svg).to.include("<rect");
          expect(svg).to.include('viewBox="0 0 16 16"');
        }
      }
    });

    it("should produce different SVGs for different backgrounds", async function () {
      const svg1 = await renderer.renderSVG(0, 0, 0, 0); // bg = (0*2+0)%16 = 0
      const svg2 = await renderer.renderSVG(0, 0, 1, 0); // bg = (1*2+0)%16 = 2
      expect(svg1).to.not.equal(svg2);
    });

    it("should produce different SVGs for different characters", async function () {
      const svg1 = await renderer.renderSVG(0, 0, 0, 0); // Human Warrior
      const svg2 = await renderer.renderSVG(1, 1, 0, 0); // Elf Mage
      expect(svg1).to.not.equal(svg2);
    });
  });

  describe("tokenURI", function () {
    it("should return a valid data URI", async function () {
      const uri = await renderer.tokenURI(
        1, 0, 0, 0, 0, 5, 1, [10, 8, 12, 6, 7, 9]
      );
      expect(uri).to.match(/^data:application\/json;base64,/);
    });

    it("should contain correct metadata fields", async function () {
      const uri = await renderer.tokenURI(
        42, 1, 2, 3, 1, 10, 5, [12, 14, 10, 8, 6, 11]
      );
      const json = JSON.parse(
        Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString()
      );

      expect(json.name).to.equal("Dungeon NFA #42");
      expect(json.description).to.include("Elf");
      expect(json.description).to.include("Rogue");
      expect(json.image).to.match(/^data:image\/svg\+xml;base64,/);

      // Check attributes
      const attrs = json.attributes;
      expect(attrs).to.be.an("array");

      const race = attrs.find((a: { trait_type: string }) => a.trait_type === "Race");
      expect(race.value).to.equal("Elf");

      const cls = attrs.find((a: { trait_type: string }) => a.trait_type === "Class");
      expect(cls.value).to.equal("Rogue");

      const personality = attrs.find((a: { trait_type: string }) => a.trait_type === "Personality");
      expect(personality.value).to.equal("Kind");

      const level = attrs.find((a: { trait_type: string }) => a.trait_type === "Level");
      expect(level.value).to.equal(5);

      const str = attrs.find((a: { trait_type: string }) => a.trait_type === "STR");
      expect(str.value).to.equal(12);
    });

    it("should generate valid SVG inside the image data URI", async function () {
      const uri = await renderer.tokenURI(
        1, 0, 0, 0, 0, 0, 1, [10, 10, 10, 10, 10, 10]
      );
      const json = JSON.parse(
        Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString()
      );
      const svg = Buffer.from(
        json.image.replace("data:image/svg+xml;base64,", ""),
        "base64"
      ).toString();
      expect(svg).to.include("<svg");
      expect(svg).to.include("</svg>");
      expect(svg).to.include('shape-rendering="crispEdges"');
    });
  });
});
