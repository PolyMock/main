"use client";

import { useEffect } from "react";
import { initGlobeBubbleScene } from "@/lib/landing/globeBubbleScene";
import { initScrollEffects } from "@/lib/landing/scrollEffects";
import { initBlobScene } from "@/lib/landing/blobScene";
import { initGearScene } from "@/lib/landing/gearScene";
import { initFoxScene } from "@/lib/landing/foxScene";
import { hydrateCommunityGrid } from "@/lib/landing/communityPosts";

export default function LandingRuntime() {
  useEffect(() => {
    initGlobeBubbleScene();
    initScrollEffects();
    initBlobScene();
    initGearScene();
    initFoxScene();
    void hydrateCommunityGrid();
  }, []);

  return null;
}
