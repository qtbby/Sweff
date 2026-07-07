# Sweff — Smart Photo Framing Studio

A simple, powerful, and robust web tool to batch frame photos with custom portrait/landscape overlays.  
**Live Demo:** [https://qtbby.github.io/Sweff/](https://qtbby.github.io/Sweff/)

This application allows you to seamlessly add beautiful overlay frames to your batch of photos without the hassle of editing them one by one. It auto-detects the orientation of your images (matching portrait frames with portrait images, and landscape with landscape), gives you deep, professional-level editing controls directly in your browser, and exports them in high quality.

## Key Operational Adjustments Added:
* **Null Pointer Prevention**: Resolved a workspace crash caused by a missing HTML slider reference element on startup initialization.
* **1:1 Proportional Pan & Crop Engine**: Panning calculations are dynamically cross-referenced against the current transformation view space matrix scale factor instead of static device pixel arrays, creating fluid tracking directly aligned to your mouse cursor.
* **Filter Execution Cache**: Minimizes redraw latency during real-time interactive adjustments via hardware-accelerated canvas components.

## Features
- **Smart Frame Uploading:** Upload up to two custom frames (must be one portrait and one landscape). The system intelligently prevents incorrect multiple-uploads of the same orientation.
- **Robust Preview Generation:** Fluid and clean grid preview with perfectly contained images (no overlapping bugs).
- **Pro Photo Editor:** Edit images in full screen with controls over contrast, brightness, saturation, exposure, and a suite of advanced adjustment placeholders, complete with an "Apply to All" action.
- **Multi-Theme Support:** Switch between Light, Default, Dark, and Custom themes.
- **Local & Private:** Everything runs right in your browser. Images never leave your device.
- **Enhanced Export:** Download everything cleanly packaged in a ZIP file.

## Need Help?
If you encounter any problems, please feel free to [Report a Problem](mailto:alalbit.r@gmail.com).

**Owner & Developer:** Al R. Albit
