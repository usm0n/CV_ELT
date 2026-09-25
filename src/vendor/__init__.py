"""Third-party code shipped with the repository, unchanged apart from import paths.

trackers/  ByteTrack from Roboflow `trackers` 2.6.0 (Apache-2.0, see trackers/LICENSE): only the
           modules ByteTrackTracker needs. The PyPI package also depends on the GUI build of OpenCV,
           which replaces opencv-python-headless and cannot be imported on a server without libxcb/libGL.
"""
