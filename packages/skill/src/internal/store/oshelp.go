package store

import "os"

func removeFile(path string) error { return os.Remove(path) }

func isNotExist(err error) bool { return os.IsNotExist(err) }
